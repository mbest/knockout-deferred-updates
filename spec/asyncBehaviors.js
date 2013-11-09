describe("Throttled observables", function() {
    beforeEach(function() {
        jasmine.Clock.useMock();
    });

    it("Should notify subscribers asynchronously after writes stop for the specified timeout duration", function() {
        var observable = ko.observable('A').extend({ throttle: 100 });
        var notifiedValues = [];
        observable.subscribe(function(value) {
            notifiedValues.push(value);
        });

        // Mutate a few times
        observable('B');
        observable('C');
        observable('D');
        expect(notifiedValues.length).toEqual(0); // Should not notify synchronously

        // Wait
        jasmine.Clock.tick(10);
        // Mutate more
        observable('E');
        observable('F');
        expect(notifiedValues.length).toEqual(0); // Should not notify until end of throttle timeout

        // Wait until after timeout
        jasmine.Clock.tick(100);
        expect(notifiedValues.length).toEqual(1);
        expect(notifiedValues[0]).toEqual("F");
    });
});

describe("Throttled dependent observables", function() {
    beforeEach(function() {
        jasmine.Clock.useMock();
    });

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
        // Mutate
        underlying('New value');
        expect(lastUpdateValue).toBeUndefined(); // Should not update synchronously
        expect(notifiedValues.length).toEqual(0);
    	expect(computedNotifiedValues.length).toEqual(0);

        // Still shouldn't have evaluated
        jasmine.Clock.tick(10);
        expect(lastUpdateValue).toBeUndefined(); // Should not update until throttle timeout
        expect(notifiedValues.length).toEqual(0);
    	expect(computedNotifiedValues.length).toEqual(0);

        // Now wait for throttle timeout
        jasmine.Clock.tick(100);
        expect(lastUpdateValue).toEqual('New value');
        expect(notifiedValues.length).toEqual(1);
        expect(notifiedValues[0]).toEqual('New value');
    	expect(computedNotifiedValues.length).toEqual(1);
    	expect(computedNotifiedValues[0]).toEqual('New value');
    });

    it("Should run evaluator only once when dependencies stop updating for the specified timeout duration", function() {
        var evaluationCount = 0;
        var someDependency = ko.observable();
        var asyncDepObs = ko.dependentObservable(function() {
            evaluationCount++;
            return someDependency();
        }).extend({ throttle: 100 });

        // Mutate a few times synchronously
        expect(evaluationCount).toEqual(1); // Evaluates synchronously when first created, like all dependent observables
        someDependency("A");
        someDependency("B");
        someDependency("C");
        expect(evaluationCount).toEqual(1); // Should not re-evaluate synchronously when dependencies update

        // Also mutate async
        jasmine.Clock.tick(10);
        someDependency("D");
        expect(evaluationCount).toEqual(1);

        // Now wait for throttle timeout
        jasmine.Clock.tick(100);
        expect(evaluationCount).toEqual(2); // Finally, it's evaluated
        expect(asyncDepObs()).toEqual("D");
    });
});


// ---------

describe("Asynchronous bindings", function() {
    var testNode;

    beforeEach(function() {
        testNode = document.createElement("div");
        testNode.id = "testNode";
        document.body.appendChild(testNode);
        jasmine.Clock.useMock();
    });
    afterEach(function() {
        document.body.removeChild(testNode);
    });

    it("Should update bindings asynchronously", function() {
        var observable = new ko.observable();
        var initPassedValues = [], updatePassedValues = [];
        ko.bindingHandlers.test = {
            init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()()); },
            update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()()); }
        };
        testNode.innerHTML = "<div data-bind='test: myObservable'></div>";

        ko.applyBindings({ myObservable: observable }, testNode);

        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);
        expect(initPassedValues[0]).toEqual(undefined);
        expect(updatePassedValues[0]).toEqual(undefined);

        // mutate; update should not be called yet
        observable("A");
        expect(updatePassedValues.length).toEqual(1);

        // mutate; update should not be called yet
        observable("B");
        expect(updatePassedValues.length).toEqual(1);

        jasmine.Clock.tick(100);
        // only the latest value should be used
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(2);
        expect(updatePassedValues[1]).toEqual("B");
    });

    it("Should update template asynchronously", function() {
        var observable = new ko.observable();
        var initPassedValues = [], updatePassedValues = [];
        ko.bindingHandlers.test = {
            init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()); },
            update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()); }
        };
        testNode.innerHTML = "<div data-bind='template: {data: myObservable}'><div data-bind='test: $data'></div></div>";

        ko.applyBindings({ myObservable: observable }, testNode);

        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);
        expect(initPassedValues[0]).toEqual(undefined);
        expect(updatePassedValues[0]).toEqual(undefined);

        // mutate; template should not re-evaluated yet
        observable("A");
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);

        // mutate again; template should not re-evaluated yet
        observable("B");
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);

        jasmine.Clock.tick(10);
        // only the latest value should be used
        expect(initPassedValues.length).toEqual(2);
        expect(updatePassedValues.length).toEqual(2);
        expect(updatePassedValues[1]).toEqual("B");
    });

    it("Should update 'foreach' items asynchronously", function() {
        var observable = new ko.observableArray(["A"]);
        var initPassedValues = [], updatePassedValues = [];
        ko.bindingHandlers.test = {
            init: function (element, valueAccessor) { initPassedValues.push(valueAccessor()); },
            update: function (element, valueAccessor) { updatePassedValues.push(valueAccessor()); }
        };
        testNode.innerHTML = "<div data-bind='foreach: {data: myObservables}'><div data-bind='test: $data'></div></div>";

        ko.applyBindings({ myObservables: observable }, testNode);

        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);
        expect(initPassedValues[0]).toEqual("A");
        expect(updatePassedValues[0]).toEqual("A");

        // mutate; template should not re-evaluated yet
        observable(["B"]);
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);

        // mutate again; template should not re-evaluated yet
        observable(["C"]);
        expect(initPassedValues.length).toEqual(1);
        expect(updatePassedValues.length).toEqual(1);

        jasmine.Clock.tick(10);
        // only the latest value should be used
        expect(initPassedValues.length).toEqual(2);
        expect(updatePassedValues.length).toEqual(2);
        expect(initPassedValues[1]).toEqual("C");
        expect(updatePassedValues[1]).toEqual("C");
    });
});