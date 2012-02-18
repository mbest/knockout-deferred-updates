// Deferred Updates plugin for Knockout http://knockoutjs.com/
// (c) Michael Best, Steven Sanderson
// License: MIT (http://www.opensource.org/licenses/mit-license.php)

(function(ko, undefined) {

/*
 * Task manager for deferred tasks
 */
ko.tasks = (function() {
    var setImmediate = !!window['setImmediate'] ? 'setImmediate' : 'setTimeout';    // Use setImmediate function if available; otherwise use setTimeout
    var evaluatorHandler, evaluatorsArray = [], taskStack = [], indexProcessing;

    function pushTaskState() {
        taskStack.push(evaluatorsArray.length);
    }

    function popTaskState() {
        var originalLength = taskStack.pop();
        if (evaluatorsArray.length > originalLength)
            processEvaluators(originalLength);
    }

    function processEvaluators(start) {
        // New items might be added to evaluatorsArray during this loop
        // So always check evaluatorsArray.length
        try {
            for (var i = start || 0; i < evaluatorsArray.length; i++) {
                if (!start)
                    indexProcessing = i;
                var evaluator = evaluatorsArray[i];
                evaluator();
            }
        } finally {
            if (start) {
                // Remove only items we've just processed (shorten array to *start* items)
                evaluatorsArray.splice(start, evaluatorsArray.length);
            } else {
                // Clear array and handler to indicate that we're finished
                evaluatorsArray = [];
                indexProcessing = evaluatorHandler = undefined;
            }
        }
    }

    // need to wrap function call because Firefox calls setTimeout callback with a parameter
    function processEvaluatorsCallback() {
        processEvaluators();
    }

    var tasks = {
        processImmediate: function(evaluator, object, args) {
            pushTaskState();
            try {
                return evaluator.apply(object, args || []);
            } finally {
                popTaskState();
            }
        },

        processDelayed: function(evaluator, distinct) {
            if ((distinct || distinct === undefined) && ko.utils.arrayIndexOf(evaluatorsArray, evaluator, indexProcessing) >= 0) {
                // Don't add evaluator if distinct is set (or missing) and evaluator is already in list
                return;
            }
            evaluatorsArray.push(evaluator);
            if (!taskStack.length && indexProcessing === undefined && !evaluatorHandler) {
                evaluatorHandler = window[setImmediate](processEvaluatorsCallback);
            }
        },

        makeProcessedCallback: function(evaluator) {
            return function() {
                return tasks.processImmediate(evaluator, this, arguments);
            }
        }
    };

    ko.evaluateAsynchronously = function(evaluator, timeout) {
        return window[timeout ? setImmediate : 'setTimeout'](tasks.makeProcessedCallback(evaluator), timeout);
    }

    return tasks;
})();

function findNameMethodSignatureContaining(obj, match) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a].toString().indexOf(match) >= 0)
            return a;
}

function findPropertyName(obj, equals) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a] === equals)
            return a;
}

function findSubObjectWithProperty(obj, prop) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a] && obj[a][prop])
            return obj[a];
}


/*
 * Sniff out the names and objects of Knockout internals
 */

// Find ko.dependencyDetection and its methods
var depDet = findSubObjectWithProperty(ko, 'end'),
    depDetBeginName = findNameMethodSignatureContaining(depDet, '.push({'),
    depDetRegisterName = findNameMethodSignatureContaining(depDet, '.length');

// Find hidden properties and methods of ko.computed and its returned values
// Also find the minified name of ko.computed (so Knockout will also use the new version)
var oldComputed = ko.computed,
    computedName = findPropertyName(ko, oldComputed),
    koProtoName = findPropertyName(oldComputed.fn, oldComputed),
    computedProto = ko.computed(function() {}),
    getDependenciesCountName = findPropertyName(computedProto, computedProto.getDependenciesCount),
    hasWriteFunctionName = findPropertyName(computedProto, false),
    disposeName = findPropertyName(computedProto, computedProto.dispose);

// Find ko.utils.domNodeIsAttachedToDocument
var nodeInDocName = findNameMethodSignatureContaining(ko.utils, 'document)');

/*
 * New ko.computed with support for deferred updates (and other fixes)
 */
var newComputed = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
    var _latestValue,
        _needsEvaluation = true,
        _isBeingEvaluated = false,
        readFunction = evaluatorFunctionOrOptions;

    if (readFunction && typeof readFunction == "object") {
        // Single-parameter syntax - everything is on this "options" param
        options = readFunction;
        readFunction = options["read"];
    } else {
        // Multi-parameter syntax - construct the options according to the params passed
        options = options || {};
        if (!readFunction)
            readFunction = options["read"];
    }
    // By here, "options" is always non-null
    if (typeof readFunction != "function")
        throw new Error("Pass a function that returns the value of the ko.computed");

    var writeFunction = options["write"];
    if (!evaluatorFunctionTarget)
        evaluatorFunctionTarget = options["owner"];

    var _subscriptionsToDependencies = [];
    function disposeAllSubscriptionsToDependencies() {
        ko.utils.arrayForEach(_subscriptionsToDependencies, function (subscription) {
            subscription.dispose();
        });
        _subscriptionsToDependencies = [];
    }

    var evaluationTimeoutInstance = null;
    function evaluatePossiblyAsync() {
        if (_isBeingEvaluated)
            return;
        _needsEvaluation = true;
        var throttleEvaluationTimeout = dependentObservable['throttleEvaluation'];
        if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
            clearTimeout(evaluationTimeoutInstance);
            evaluationTimeoutInstance = setTimeout(evaluateImmediate, throttleEvaluationTimeout);
        } else if (newComputed.deferUpdates || dependentObservable.deferUpdates)
            ko.tasks.processDelayed(evaluateImmediate);
        else
            evaluateImmediate();
    }

    function evaluateImmediate() {
        if (_isBeingEvaluated || !_needsEvaluation)
            return;

        // disposeWhen won't be set until after initial evaluation
        if (disposeWhen && disposeWhen()) {
            dependentObservable.dispose();
            return;
        }

        _isBeingEvaluated = true;
        try {
            disposeAllSubscriptionsToDependencies();
            depDet[depDetBeginName](function(subscribable) {
                _subscriptionsToDependencies.push(subscribable.subscribe(evaluatePossiblyAsync));
            });
            var newValue = readFunction.call(evaluatorFunctionTarget);
            dependentObservable["notifySubscribers"](_latestValue, "beforeChange");
            _latestValue = newValue;
            _needsEvaluation = false;
        } finally {
            depDet.end();
        }

        dependentObservable["notifySubscribers"](_latestValue);
        _isBeingEvaluated = false;
    }

    function evaluateInitial() {
        _isBeingEvaluated = true;
        try {
            depDet[depDetBeginName](function(subscribable) {
                _subscriptionsToDependencies.push(subscribable.subscribe(evaluatePossiblyAsync));
            });
            _latestValue = readFunction.call(evaluatorFunctionTarget);
        } finally {
            depDet.end();
        }
        _needsEvaluation = _isBeingEvaluated = false;
    }

    function dependentObservable() {
        if (arguments.length > 0) {
            set.apply(dependentObservable, arguments);
        } else {
            return get();
        }
    }

    function set() {
        if (typeof writeFunction === "function") {
            // Writing a value
            writeFunction.apply(evaluatorFunctionTarget, arguments);
        } else {
            throw new Error("Cannot write a value to a ko.computed unless you specify a 'write' option. If you wish to read the current value, don't pass any parameters.");
        }
    }

    function get() {
        // Reading the value
        if (_needsEvaluation)
            evaluateImmediate();
        depDet[depDetRegisterName](dependentObservable);
        return _latestValue;
    }

    if (options['deferEvaluation'] !== true)
        evaluateInitial();

    var dispose = disposeAllSubscriptionsToDependencies;

    // Build "disposeWhenNodeIsRemoved" and "disposeWhenNodeIsRemovedCallback" option values
    // (Note: "disposeWhenNodeIsRemoved" option both proactively disposes as soon as the node is removed using ko.removeNode(),
    // plus adds a "disposeWhen" callback that, on each evaluation, disposes if the node was removed by some other means.)
    var disposeWhenNodeIsRemoved = (typeof options["disposeWhenNodeIsRemoved"] == "object") ? options["disposeWhenNodeIsRemoved"] : null;
    var disposeWhen = options["disposeWhen"] || function() { return false; };
    if (disposeWhenNodeIsRemoved) {
        dispose = function() {
            ko.utils.domNodeDisposal.removeDisposeCallback(disposeWhenNodeIsRemoved, arguments.callee);
            disposeAllSubscriptionsToDependencies();
        };
        ko.utils.domNodeDisposal.addDisposeCallback(disposeWhenNodeIsRemoved, dispose);
        var existingDisposeWhenFunction = disposeWhen;
        disposeWhen = function () {
            return !ko.utils[nodeInDocName](disposeWhenNodeIsRemoved) || existingDisposeWhenFunction();
        }
    }

    // Set properties of returned function
    ko.subscribable.call(dependentObservable);
    ko.utils.extend(dependentObservable, newComputed.fn);

    dependentObservable[getDependenciesCountName] = dependentObservable.getDependenciesCount = function () { return _subscriptionsToDependencies.length; };
    dependentObservable[hasWriteFunctionName] = dependentObservable.hasWriteFunction = typeof writeFunction === "function";
    dependentObservable[disposeName] = dependentObservable.dispose = function () { dispose(); };

    return dependentObservable;
};

// Set ko.computed properties
newComputed[koProtoName] = oldComputed[koProtoName];
newComputed.fn = oldComputed.fn;
newComputed.fn[koProtoName] = newComputed;
newComputed.deferUpdates = true;

// Make all pointers to ko.computed point to the new one
ko[computedName] = ko.computed = ko.dependentObservable = newComputed;

// Clear objects references we don't need anymore
oldComputed = computedProto = null;

})(ko);
