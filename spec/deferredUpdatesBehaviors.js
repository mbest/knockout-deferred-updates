describe('Deferred Updates', function() {

    describe('Observable', function() {
        it('Should notify subscribers about only latest value', function () {
            var instance = new ko.observable();
            var notifiedValues = [];
            instance.subscribe(function (value) {
                notifiedValues.push(value);
            });

            instance('A');
            instance('B');
            ko.processAllDeferredUpdates();

            expect(notifiedValues.length).toEqual(1);
            expect(notifiedValues[0]).toEqual('B');
        });
    });

    describe('Computed Observable', function() {
        it('Should defer notification of changes and minimize evaluation', function () {
            var timesEvaluated = 0,
                data = ko.observable('A'),
                computed = ko.computed(function () { ++timesEvaluated; return data(); }),
                notifiedValue,
                subscription = computed.subscribe(function (value) { notifiedValue = value; });

            expect(computed()).toEqual('A');
            expect(timesEvaluated).toEqual(1);
            ko.processAllDeferredUpdates();
            expect(notifiedValue).toEqual(undefined);

            data('B');
            expect(timesEvaluated).toEqual(1);  // not immediately evaluated
            expect(computed()).toEqual('B');
            expect(timesEvaluated).toEqual(2);
            expect(notifiedValue).toEqual(undefined);

            ko.processAllDeferredUpdates();
            expect(notifiedValue).toEqual('B');
        });

        it('Should notify first change of computed with deferEvaluation if value to changed to undefined', function () {
            var data = ko.observable('A'),
                computed = ko.computed(data, null, {deferEvaluation: true}),
                notifiedValue = 'not the right value',
                subscription = computed.subscribe(function (value) { notifiedValue = value; });

            expect(computed()).toEqual('A');

            data(undefined);
            expect(computed()).toEqual(undefined);

            ko.processAllDeferredUpdates();
            expect(notifiedValue).toEqual(undefined);
        });

        it('Should notify first change to pure computed after awakening if value changed to last notified value', function() {
            var data = ko.observable('A'),
                computed = ko.pureComputed(data),
                notifiedValues = [],
                subFunc = function (value) { notifiedValues.push(value); },
                subscription = computed.subscribe(subFunc);

            data('B');
            expect(computed()).toEqual('B');
            ko.processAllDeferredUpdates();
            expect(notifiedValues).toEqual(['B']);

            subscription.dispose();
            notifiedValues = [];
            data('C');
            expect(computed()).toEqual('C');
            ko.processAllDeferredUpdates();
            expect(notifiedValues).toEqual([]);

            subscription = computed.subscribe(subFunc);
            data('B');
            expect(computed()).toEqual('B');
            ko.processAllDeferredUpdates();
            expect(notifiedValues).toEqual(['B']);
        });

        it('Should invoke the read function (and trigger notifications) if the write function updates computed observables', function() {
            var observable = ko.observable();
            var computed = ko.computed({
                read: function() { return observable(); },
                write: function(value) { observable(value); }
            });
            var notifiedValue;
            var subscription = computed.subscribe(function(value) {
                notifiedValue = value;
            });
            subscription.deferUpdates = false;

            // Initially undefined
            expect(computed()).toEqual(undefined);
            expect(notifiedValue).toEqual(undefined);

            // Update computed and verify that correct notification happened
            computed("new value");
            expect(notifiedValue).toEqual("new value");
        });

        it('Should be able to use \'ko.ignoreDependencies\' within a computed to avoid dependencies', function() {
            var observable = ko.observable(1),
                computed = ko.computed(function () {
                    return ko.ignoreDependencies(function() { return observable() + 1 } );
                });
            expect(computed()).toEqual(2);

            observable(50);
            expect(computed()).toEqual(2);    // value wasn't changed
        });

        it('getDependencies sould return list of dependencies', function() {
            var observableA = ko.observable("A");
            var observableB = ko.observable("B");
            var observableToUse = ko.observable("A");
            var computed = ko.computed(function () {
                return observableToUse() == "A" ? observableA() : observableB();
            });

            expect(computed()).toEqual("A");
            expect(computed.getDependencies()).toEqual([observableToUse, observableA]);
            expect(observableA.getDependents()).toEqual([computed]);
            expect(observableB.getDependents()).toEqual([]);

            // Switch to other observable
            observableToUse("B");
            expect(computed()).toEqual("B");
            expect(computed.getDependencies()).toEqual([observableToUse, observableB]);
            expect(observableA.getDependents()).toEqual([]);
            expect(observableB.getDependents()).toEqual([computed]);
        });

        it('Should be able to pause/resume a computed using activeWhen', function() {
            var observable = ko.observable("A");
            var isActive = ko.observable(true);
            var computed = ko.computed(function () {
                return observable();
            });
            computed.activeWhen(isActive);   // intially active

            // When not paused, computed is updated normally
            expect(computed()).toEqual("A");
            observable("B");
            expect(computed()).toEqual("B");

            // When paused, computed value stays the same until unpaused
            isActive(false);
            observable("C");
            expect(computed()).toEqual("B");
            isActive(true);
            expect(computed()).toEqual("C");
        });
    });

    describe('Observable Array change tracking', function() {
        it('Should provide correct changelist when multiple updates are merged into one notification', function() {
            var myArray = ko.observableArray(['Alpha', 'Beta']),
                changelist;

            myArray.subscribe(function(changes) {
                changelist = changes;
            }, null, 'arrayChange');

            myArray.push('Gamma');
            myArray.push('Delta');
            ko.processAllDeferredUpdates();
            expect(changelist).toEqual([
                { status : 'added', value : 'Gamma', index : 2 },
                { status : 'added', value : 'Delta', index : 3 }
            ]);

            changelist = undefined;
            myArray.shift();
            myArray.shift();
            ko.processAllDeferredUpdates();
            expect(changelist).toEqual([
                { status : 'deleted', value : 'Alpha', index : 0 },
                { status : 'deleted', value : 'Beta', index : 1 }
            ]);

            changelist = undefined;
            myArray.push('Epsilon');
            myArray.pop();
            ko.processAllDeferredUpdates();
            expect(changelist).toEqualOneOf([[], undefined]);
        });
    });

    describe('Recursive updates', function() {
        beforeEach(jasmine.prepareTestNode);

        it('Should be prevented for value binding on multiple select boxes', function() {
            testNode.innerHTML = "<select data-bind=\"options: ['abc','def','ghi'], value: x\"></select><select data-bind=\"options: ['xyz','uvw'], value: x\"></select>";
            var observable = ko.observable();
            expect(ko.tasks.makeProcessedCallback(function() {
                ko.applyBindings({ x: observable }, testNode);
            })).toThrowContaining('Too much recursion');
        });
    });

});
