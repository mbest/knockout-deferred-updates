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
                var evObj = evaluatorsArray[i], evaluator = evObj.evaluator;
                evaluator.apply(evObj.object, evObj.args || []);
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

    function isEvaluatorDuplicate(evaluator) {
        for (var i = indexProcessing || 0, j = evaluatorsArray.length; i < j; i++)
            if (evaluatorsArray[i].evaluator == evaluator)
                return true;
        return false;
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

        processDelayed: function(evaluator, distinct, extras) {
            if ((distinct || distinct === undefined) && isEvaluatorDuplicate(evaluator)) {
                // Don't add evaluator if distinct is set (or missing) and evaluator is already in list
                return false;
            }
            evaluatorsArray.push(ko.utils.extend({evaluator: evaluator}, extras || {}));
            if (!taskStack.length && indexProcessing === undefined && !evaluatorHandler) {
                evaluatorHandler = window[setImmediate](processEvaluatorsCallback);
            }
            return true;
        },

        makeProcessedCallback: function(evaluator) {
            return function() {
                return tasks.processImmediate(evaluator, this, arguments);
            }
        }
    };

    ko.processDeferredBindingUpdatesForNode = function(node) {
        for (var i = 0, j = evaluatorsArray.length; i < j; i++) {
            if (evaluatorsArray[i].node == node) {
                var evaluator = evaluatorsArray[i].evaluator;
                evaluator();
            }
        }
    };

    ko.processAllDeferredBindingUpdates = function(node) {
        for (var i = 0, j = evaluatorsArray.length; i < j; i++) {
            if (evaluatorsArray[i].node) {
                var evaluator = evaluatorsArray[i].evaluator;
                evaluator();
            }
        }
    };

    ko.evaluateAsynchronously = function(evaluator, timeout) {
        return setTimeout(tasks.makeProcessedCallback(evaluator), timeout);
    };

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

// Find the name of the ko.subscribable.fn.subscribe function
var subFnObj = ko.subscribable.fn,
    subFnName = findNameMethodSignatureContaining(subFnObj, '.bind(');

/*
 * Add ko.ignoreDependencies 
 */
ko.ignoreDependencies = function(callback, object, args) {
    try {
        depDet[depDetBeginName](function() {});
        return callback.apply(object, args || []);
    } finally {
        depDet.end();
    }
}

/*
 * Replace ko.subscribable.fn.subscribe with one where change events are deferred
 */
subFnObj.oldSubscribe = subFnObj[subFnName];    // Save old subscribe function
subFnObj[subFnName] = function (callback, callbackTarget, event, deferUpdates) {
    if (callback.toString().indexOf('throttleEvaluation') === -1) {
        var newCallback = function(valueToNotify) {
            if (((newComputed.deferUpdates && deferUpdates !== false) || deferUpdates) && (!event || event == 'change'))
                ko.tasks.processDelayed(callback, false, {object: callbackTarget, args: [valueToNotify]}); 
            else
                ko.ignoreDependencies(callback, callbackTarget, [valueToNotify]);
        };
        return this.oldSubscribe(newCallback, undefined, event);
    } else {
        return this.oldSubscribe(callback, callbackTarget, event);
    }
}


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
        _needsEvaluation = false;
    }

    var evaluationTimeoutInstance = null;
    function evaluatePossiblyAsync() {
        var shouldNotify = !_needsEvaluation;
        _needsEvaluation = true;
        var throttleEvaluationTimeout = dependentObservable['throttleEvaluation'];
        if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
            clearTimeout(evaluationTimeoutInstance);
            evaluationTimeoutInstance = ko.evaluateAsynchronously(evaluateImmediate, throttleEvaluationTimeout);
        } else if ((newComputed.deferUpdates && dependentObservable.deferUpdates !== false) || dependentObservable.deferUpdates)
            shouldNotify = ko.tasks.processDelayed(evaluateImmediate, true, {node: disposeWhenNodeIsRemoved});
        else
            shouldNotify = evaluateImmediate();

        if (shouldNotify && dependentObservable["notifySubscribers"]) {     // notifySubscribers won't exist on first evaluation (but there won't be any subscribers anyway) 
            dependentObservable["notifySubscribers"](_latestValue, "dirty");
            if (!_needsEvaluation && throttleEvaluationTimeout)  // The notification might have triggered an evaluation
                clearTimeout(evaluationTimeoutInstance);
        }
    }

    function addDependency(subscribable) {
        var event = (subscribable[koProtoName] === newComputed) ? "dirty" : "change";
        _subscriptionsToDependencies.push(subscribable.subscribe(evaluatePossiblyAsync, null, event));
    }

    function evaluateImmediate() {
        if (_isBeingEvaluated || !_needsEvaluation)
            return false;

        // disposeWhen won't be set until after initial evaluation
        if (disposeWhen && disposeWhen()) {
            dependentObservable.dispose();
            return false;
        }

        _isBeingEvaluated = true;
        try {
            disposeAllSubscriptionsToDependencies();
            depDet[depDetBeginName](addDependency);
            var newValue = readFunction.call(evaluatorFunctionTarget);
            dependentObservable["notifySubscribers"](_latestValue, "beforeChange");
            _latestValue = newValue;
            _needsEvaluation = false;
        } finally {
            depDet.end();
        }

        dependentObservable["notifySubscribers"](_latestValue);
        _isBeingEvaluated = false;
        return true;
    }

    function evaluateInitial() {
        _isBeingEvaluated = true;
        try {
            depDet[depDetBeginName](addDependency);
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
            // Turn off deferred updates for this observable during the write so that the 'write' is registered
            // immediately (assuming that the read function accesses any observables that are written to).
            var saveDeferValue = dependentObservable.deferUpdates;
            dependentObservable.deferUpdates = false;

            writeFunction.apply(evaluatorFunctionTarget, arguments);

            dependentObservable.deferUpdates = saveDeferValue;
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

/*
 * New throttle extender
 */
ko.extenders['throttle'] = function(target, timeout) {
    // Throttling means two things:

    if (ko.isWriteableObservable(target)) {
        // (1) For writable targets (observables, or writable dependent observables), we throttle *writes*
        //     so the target cannot change value synchronously or faster than a certain rate
        var writeTimeoutInstance = null;
        return ko.dependentObservable({
            'read': target,
            'write': function(value) {
                clearTimeout(writeTimeoutInstance);
                writeTimeoutInstance = ko.evaluateAsynchronously(function() {
                    target(value);
                }, timeout);
            }
        });
    } else {
        // (2) For dependent observables, we throttle *evaluations* so that, no matter how fast its dependencies
        //     notify updates, the target doesn't re-evaluate (and hence doesn't notify) faster than a certain rate
        target['throttleEvaluation'] = timeout;
        return target;
    }
};

})(ko);
