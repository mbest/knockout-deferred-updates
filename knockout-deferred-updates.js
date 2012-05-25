// Deferred Updates plugin for Knockout http://knockoutjs.com/
// (c) Michael Best, Steven Sanderson
// License: MIT (http://www.opensource.org/licenses/mit-license.php)
// Version 1.1.0

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

    function currentStart() {
        return taskStack.length ? taskStack[taskStack.length-1] : 0;
    }

    function processEvaluators(start) {
        try {
            // New items might be added to evaluatorsArray during this loop
            // So always check evaluatorsArray.length
            for (var i = start || 0; i < evaluatorsArray.length; i++) {
                indexProcessing = i;
                var evObj = evaluatorsArray[i], evaluator = evObj.evaluator;
                // Check/set a flag for the evaluator so we don't call it again if processEvaluators is called recursively
                if (!evObj.processed) {
                    evObj.processed = true;
                    evaluator.apply(evObj.object, evObj.args || []);
                }
            }
        } finally {
            if (start) {
                // Remove only items we've just processed (shorten array to *start* items)
                evaluatorsArray.splice(start, evaluatorsArray.length);
            } else {
                // Clear array and handler to indicate that we're finished
                evaluatorsArray = [];
                evaluatorHandler = undefined;
            }
            indexProcessing = undefined;
        }
    }

    // need to wrap function call because Firefox calls setTimeout callback with a parameter
    function processEvaluatorsCallback() {
        processEvaluators();
    }

    function isEvaluatorDuplicate(evaluator, extras) {
        for (var i = indexProcessing || currentStart(), j = evaluatorsArray.length; i < j; i++)
            if (evaluatorsArray[i].evaluator == evaluator && !evaluatorsArray[i].processed) {
                if (extras)
                    ko.utils.extend(evaluatorsArray[i], extras);
                return true;
            }
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
            if ((distinct || distinct === undefined) && isEvaluatorDuplicate(evaluator, extras)) {
                // Don't add evaluator if distinct is set (or missing) and evaluator is already in list
                return false;
            }
            evaluatorsArray.push(ko.utils.extend({evaluator: evaluator}, extras || {}));
            if (!taskStack.length && !evaluatorHandler) {
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

    ko.processDeferredBindingUpdatesForNode =       // deprecated (included for compatibility)
    ko.processAllDeferredBindingUpdates = function(node) {
        // New items might be added to evaluatorsArray during this loop
        // So always check evaluatorsArray.length
        for (var i = 0; i < evaluatorsArray.length; i++) {
            var evObj = evaluatorsArray[i];
            if (evObj.node && !evObj.processed) {
                evObj.processed = true;
                var evaluator = evaluatorsArray[i].evaluator;
                evaluator();
            }
        }
    };

    ko.processAllDeferredUpdates = processEvaluatorsCallback;

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
var nodeInDocName = findNameMethodSignatureContaining(ko.utils, 'ocument)');

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
subFnObj[subFnName] = function (callback, callbackTarget, event, deferUpdates, isComputed) {
    event = event || 'change';
    if (!isComputed) {
        var newCallback = function(valueToNotify) {
            if (((newComputed.deferUpdates && deferUpdates !== false) || deferUpdates) && event == 'change')
                ko.tasks.processDelayed(callback, false, {object: callbackTarget, args: [valueToNotify, event]});
            else
                ko.ignoreDependencies(callback, callbackTarget, [valueToNotify, event]);
        };
    } else {
        var newCallback = function(valueToNotify) {
            callback(valueToNotify, event);
        };
    }
    var subscription = this.oldSubscribe(newCallback, null, event);
    subscription.target = this;
    return subscription;
}


/*
 * New ko.computed with support for deferred updates (and other fixes)
 */
var newComputed = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
    var _latestValue,
        _possiblyNeedsEvaluation = false,
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
        _possiblyNeedsEvaluation = _needsEvaluation = false;
    }

    var evaluationTimeoutInstance = null;
    function evaluatePossiblyAsync(value, event) {
        var isDirtyEvent = (event == "dirty");
        var shouldNotify = isDirtyEvent && !_possiblyNeedsEvaluation && !_needsEvaluation;
        if (isDirtyEvent)
            _possiblyNeedsEvaluation = true;
        else
            _needsEvaluation = true;
        var throttleEvaluationTimeout = dependentObservable['throttleEvaluation'];
        if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
            clearTimeout(evaluationTimeoutInstance);
            evaluationTimeoutInstance = ko.evaluateAsynchronously(evaluateImmediate, throttleEvaluationTimeout);
        } else if ((newComputed.deferUpdates && dependentObservable.deferUpdates !== false) || dependentObservable.deferUpdates)
            shouldNotify = ko.tasks.processDelayed(evaluateImmediate, true, {node: disposeWhenNodeIsRemoved});
        else if (_needsEvaluation)
            shouldNotify = evaluateImmediate();

        if (shouldNotify && dependentObservable["notifySubscribers"]) {     // notifySubscribers won't exist on first evaluation (but there won't be any subscribers anyway)
            dependentObservable["notifySubscribers"](_latestValue, "dirty");
            if (!_possiblyNeedsEvaluation && throttleEvaluationTimeout)  // The notification might have triggered an evaluation
                clearTimeout(evaluationTimeoutInstance);
        }
    }

    function markAsChanged() {
        _needsEvaluation = true;
    }

    function addDependency(subscribable) {
        var event = "change";
        if (subscribable[koProtoName] === newComputed) {
            _subscriptionsToDependencies.push(subscribable.subscribe(markAsChanged, null, "change", false, true));
            event = "dirty";
    }
        _subscriptionsToDependencies.push(subscribable.subscribe(evaluatePossiblyAsync, null, event, false, true));
    }

    function evaluateImmediate(force) {
        if (_isBeingEvaluated || (!_needsEvaluation && !(force === true))) {    // test for exact *true* value since Firefox will pass an integer value when this function is called through setTimeout
            _possiblyNeedsEvaluation = _needsEvaluation;
            return false;
        }

        // disposeWhen won't be set until after initial evaluation
        if (disposeWhen && disposeWhen()) {
            dependentObservable.dispose();
            return false;
        }

        _isBeingEvaluated = true;
        try {
            // Initially, we assume that none of the subscriptions are still being used (i.e., all are candidates for disposal).
            // Then, during evaluation, we cross off any that are in fact still being used.
            var disposalCandidates = ko.utils.arrayMap(_subscriptionsToDependencies, function(item) {return item.target;});

            depDet[depDetBeginName](function(subscribable) {
                var inOld, found = false;
                while ((inOld = ko.utils.arrayIndexOf(disposalCandidates, subscribable)) >= 0) {
                    disposalCandidates[inOld] = undefined; // Don't want to dispose this subscription, as it's still being used
                    found = true;
                }
                if (!found)
                    addDependency(subscribable); // Brand new subscription - add it
            });

            var newValue = readFunction.call(evaluatorFunctionTarget);

            // For each subscription no longer being used, remove it from the active subscriptions list and dispose it
            for (var i = disposalCandidates.length - 1; i >= 0; i--) {
                if (disposalCandidates[i])
                    _subscriptionsToDependencies.splice(i, 1)[0].dispose();
            }

            _possiblyNeedsEvaluation = _needsEvaluation = false;

            dependentObservable["notifySubscribers"](_latestValue, "beforeChange");
            _latestValue = newValue;
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
        } else {
            // Reading the value
            if (_needsEvaluation || _possiblyNeedsEvaluation)
                evaluateImmediate(true);
            depDet[depDetRegisterName](dependentObservable);
            return _latestValue;
        }
    }

    // Need to set disposeWhenNodeIsRemoved here in case we get a notification during the initial evaluation
    var disposeWhenNodeIsRemoved = (typeof options["disposeWhenNodeIsRemoved"] == "object") ? options["disposeWhenNodeIsRemoved"] : null;

    if (options['deferEvaluation'] !== true)
        evaluateInitial();

    var dispose = disposeAllSubscriptionsToDependencies;

    // Build "disposeWhenNodeIsRemoved" and "disposeWhenNodeIsRemovedCallback" option values
    // (Note: "disposeWhenNodeIsRemoved" option both proactively disposes as soon as the node is removed using ko.removeNode(),
    // plus adds a "disposeWhen" callback that, on each evaluation, disposes if the node was removed by some other means.)
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
