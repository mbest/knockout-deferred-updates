describe("Throttled observables", function() {
    beforeEach(function() { waits(1); }); // Workaround for spurious timing-related failures on IE8 (issue #736)

    it("Should notify subscribers asynchronously after writes stop for the specified timeout duration", function() {
        var observable = ko.observable('A').extend({ throttle: 100 });
        var notifiedValues = [];
        observable.subscribe(function(value) {
            notifiedValues.push(value);
        });

        runs(function() {
            // Mutate a few times
            observable('B');
            observable('C');
            observable('D');
            expect(notifiedValues.length).toEqual(0); // Should not notify synchronously
        });

        // Wait
        waits(10);
        runs(function() {
            // Mutate more
            observable('E');
            observable('F');
            expect(notifiedValues.length).toEqual(0); // Should not notify until end of throttle timeout
        });

        // Wait until after timeout
        waitsFor(function() {
            return notifiedValues.length > 0;
        }, 150);
        runs(function() {
            expect(notifiedValues.length).toEqual(1);
            expect(notifiedValues[0]).toEqual("F");
        });
    });
});

describe("Throttled dependent observables", function() {
    beforeEach(function() { waits(1); }); // Workaround for spurious timing-related failures on IE8 (issue #736)

    it("Should notify subscribers asynchronously after dependencies stop updating for the specified timeout duration", function() {
        var underlying = ko.observable(), lastUpdateValue;
        var asyncDepObs = ko.dependentObservable(function() {
            return lastUpdateValue = underlying();
        }).extend({ throttle: 100 });
        var notifiedValues = [];
        asyncDepObs.subscribe(function(value) {
            notifiedValues.push(value);
        });
        var computedNotifiedValues = [];
        var secondComputed = ko.computed(function() {
            var value = asyncDepObs();
            if (value)
                computedNotifiedValues.push(value);
                return value;
        });


        // Check initial state
        expect(lastUpdateValue).toBeUndefined();
        runs(function() {
            // Mutate
            underlying('New value');
            expect(lastUpdateValue).toBeUndefined(); // Should not update synchronously
            expect(notifiedValues.length).toEqual(0);
        	expect(computedNotifiedValues.length).toEqual(0);
        });

        // Still shouldn't have evaluated
        waits(10);
        runs(function() {
            expect(lastUpdateValue).toBeUndefined(); // Should not update until throttle timeout
            expect(notifiedValues.length).toEqual(0);
        	expect(computedNotifiedValues.length).toEqual(0);
        });

        // Now wait for throttle timeout
        waitsFor(function() {
            return notifiedValues.length > 0;
        }, 150);
        runs(function() {
            expect(lastUpdateValue).toEqual('New value');
            expect(notifiedValues.length).toEqual(1);
            expect(notifiedValues[0]).toEqual('New value');
        	expect(computedNotifiedValues.length).toEqual(1);
        	expect(computedNotifiedValues[0]).toEqual('New value');
        });
    });

    it("Should run evaluator only once when dependencies stop updating for the specified timeout duration", function() {
        var evaluationCount = 0;
        var someDependency = ko.observable();
        var asyncDepObs = ko.dependentObservable(function() {
            evaluationCount++;
            return someDependency();
        }).extend({ throttle: 100 });

        runs(function() {
            // Mutate a few times synchronously
            expect(evaluationCount).toEqual(1); // Evaluates synchronously when first created, like all dependent observables
            someDependency("A");
            someDependency("B");
            someDependency("C");
            expect(evaluationCount).toEqual(1); // Should not re-evaluate synchronously when dependencies update
        });

        // Also mutate async
        waits(10);
        runs(function() {
            someDependency("D");
            expect(evaluationCount).toEqual(1);
        });

        // Now wait for throttle timeout
        waitsFor(function() {
            return evaluationCount > 1;
        }, 150);
        runs(function() {
            expect(evaluationCount).toEqual(2); // Finally, it's evaluated
            expect(asyncDepObs()).toEqual("D");
        });
    });
});


// ---------
/*
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
*/