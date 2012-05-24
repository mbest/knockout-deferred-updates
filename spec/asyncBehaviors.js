module("Throttled observables");

asyncTest("Should notify subscribers asynchronously after writes stop for the specified timeout duration", function() {
	var observable = ko.observable('A').extend({ throttle: 50 });
	var notifiedValues = []
	observable.subscribe(function(value) {
		notifiedValues.push(value);
	});

	// Mutate a few times
	start();
	observable('B');
	observable('C');
	observable('D');
	equal(notifiedValues.length, 0, "Should not notify synchronously");

	// Wait
	stop();
	setTimeout(function() {
		// Mutate more
		start();
		observable('E');
		observable('F');
		equal(notifiedValues.length, 0, "Should not notify until end of throttle timeout");

		// Wait until after timeout
		stop();
		setTimeout(function() {
			start();
			equal(notifiedValues.length, 1);
			equal(notifiedValues[0], "F");
		}, 60);
	}, 20);
});

// ---------

module("Throttled dependent observables");

asyncTest("Should notify subscribers asynchronously after dependencies stop updating for the specified timeout duration", function() {
	var underlying = ko.observable(), lastUpdateValue;
	var asyncDepObs = ko.dependentObservable(function() {
		return lastUpdateValue = underlying();
	}).extend({ throttle: 100 });
	var notifiedValues = []
	asyncDepObs.subscribe(function(value) {
		notifiedValues.push(value);
	});

	// Check initial state
	start();
	equal(asyncDepObs(), undefined);

	// Mutate
	underlying('New value');
	equal(lastUpdateValue, undefined, 'Should not update synchronously');
	equal(notifiedValues.length, 0);
	stop();

	// Wait
	setTimeout(function() {
		// After 50ms, still shouldn't have evaluated
		start();
		equal(lastUpdateValue, undefined, 'Should not update until throttle timeout');
		equal(notifiedValues.length, 0);
		stop();

		// Wait again
		setTimeout(function() {
			start();
			equal(lastUpdateValue, 'New value');
			equal(notifiedValues.length, 1);
			equal(notifiedValues[0], 'New value');
		}, 60);
	}, 50);
});

asyncTest("Should run evaluator only once when dependencies stop updating for the specified timeout duration", function() {
	var evaluationCount = 0;
	var someDependency = ko.observable();
	var asyncDepObs = ko.dependentObservable(function() {
		evaluationCount++;
		return someDependency();
	}).extend({ throttle: 100 });

	// Mutate a few times synchronously
	start();
	equal(evaluationCount, 1); // Evaluates synchronously when first created, like all dependent observables
	someDependency("A");
	someDependency("B");
	someDependency("C");
	equal(evaluationCount, 1, "Should not re-evaluate synchronously when dependencies update");

	// Also mutate async
	stop();
	setTimeout(function() {
		start();
		someDependency("D");
		equal(evaluationCount, 1);

		// Now wait for throttle timeout
		stop();
		setTimeout(function() {
			start();
			equal(evaluationCount, 2); // Finally, it's evaluated
			equal(asyncDepObs(), "D");
		}, 110);
	}, 10);
});

// ---------

module("Asynchronous bindings", {
    setup: function() {
        this.testNode = document.createElement("div");
        this.testNode.id = "testNode";
        document.body.appendChild(this.testNode);
    },
    teardown: function() {
        document.body.removeChild(this.testNode);
    }
});

asyncTest("Should update bindings asynchronously", function() {
    var observable = new ko.observable();
    var initPassedValues = [], updatePassedValues = [];
    ko.bindingHandlers.test = {
        init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()()); },
        update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()()); }
    };
    this.testNode.innerHTML = "<div data-bind='test: myObservable'></div>";

    ko.applyBindings({ myObservable: observable }, this.testNode);

    start();
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);
    equal(initPassedValues[0], undefined);
    equal(updatePassedValues[0], undefined);

    // mutate; update should not be called yet
    observable("A");
    equal(updatePassedValues.length, 1);

    // mutate; update should not be called yet
    observable("B");
    equal(updatePassedValues.length, 1);
    stop();

    setTimeout(function() {
        start();
        // only the latest value should be used
        equal(initPassedValues.length, 1);
        equal(updatePassedValues.length, 2);
        equal(updatePassedValues[1], "B");
    }, 10);
});

asyncTest("Should update template asynchronously", function() {
    var observable = new ko.observable();
    var initPassedValues = [], updatePassedValues = [];
    ko.bindingHandlers.test = {
        init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()); },
        update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()); }
    };
    this.testNode.innerHTML = "<div data-bind='template: {data: myObservable}'><div data-bind='test: $data'></div></div>";

    ko.applyBindings({ myObservable: observable }, this.testNode);

    start();
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);
    equal(initPassedValues[0], undefined);
    equal(updatePassedValues[0], undefined);

    // mutate; template should not re-evaluated yet
    observable("A");
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);

    // mutate again; template should not re-evaluated yet
    observable("B");
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);
    stop();

    setTimeout(function() {
        start();
        // only the latest value should be used
        equal(initPassedValues.length, 2);
        equal(updatePassedValues.length, 2);
        equal(updatePassedValues[1], "B");
    }, 10);
});

asyncTest("Should update 'foreach' items asynchronously", function() {
    var observable = new ko.observableArray(["A"]);
    var initPassedValues = [], updatePassedValues = [];
    ko.bindingHandlers.test = {
        init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()); },
        update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()); }
    };
    this.testNode.innerHTML = "<div data-bind='foreach: {data: myObservables}'><div data-bind='test: $data'></div></div>";

    ko.applyBindings({ myObservables: observable }, this.testNode);

    start();
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);
    equal(initPassedValues[0], "A");
    equal(updatePassedValues[0], "A");

    // mutate; template should not re-evaluated yet
    observable(["B"]);
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);

    // mutate again; template should not re-evaluated yet
    observable(["C"]);
    equal(initPassedValues.length, 1);
    equal(updatePassedValues.length, 1);
    stop();

    setTimeout(function() {
        start();
        // only the latest value should be used
        equal(initPassedValues.length, 2);
        equal(updatePassedValues.length, 2);
        equal(initPassedValues[1], "C");
        equal(updatePassedValues[1], "C");
    }, 10);
});
