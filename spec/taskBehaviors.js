afterEach(function() {
    ko.processAllDeferredUpdates(); // ensure that task schedule is clear after each test
});

describe('Delayed tasks', function() {
    beforeEach(function() {
        jasmine.Clock.useMock();
    });

    afterEach(function() {
        // Actually check that task schedule is clear after each test
        expect(ko.processAllDeferredUpdates()).toEqual(0);
    });

    it('Should run in next execution cycle', function() {
        var runCount = 0;
        ko.tasks.processDelayed(function() {
            runCount++;
        });
        expect(runCount).toEqual(0);

        jasmine.Clock.tick(50);
        expect(runCount).toEqual(1);
    });

    it('Should only run once even if scheduled more than once', function() {
        var runCount = 0;
        var func = function() {
            runCount++;
        };
        ko.tasks.processDelayed(func);
        ko.tasks.processDelayed(func);
        expect(runCount).toEqual(0);

        jasmine.Clock.tick(50);
        expect(runCount).toEqual(1);
    });

    it('Should run multiple times if distinct is false', function() {
        var runCount = 0;
        var func = function() {
            runCount++;
        };
        ko.tasks.processDelayed(func, false);
        ko.tasks.processDelayed(func, false);
        expect(runCount).toEqual(0);

        jasmine.Clock.tick(50);
        expect(runCount).toEqual(2);
    });

    it('Should use options from last scheduled call', function() {
        var runValue;
        var func = function(value) {
            runValue = value;
        };
        ko.tasks.processDelayed(func, true, {args:[1]});
        ko.tasks.processDelayed(func, true, {args:[2]});
        expect(runValue).toBeUndefined();

        jasmine.Clock.tick(50);
        expect(runValue).toEqual(2);
    });

    it('Should run only once if tasks are processed early using processAllDeferredUpdates', function() {
        var runCount = 0;
        var func = function() {
            runCount++;
        };
        ko.tasks.processDelayed(func);
        expect(runCount).toEqual(0);

        ko.processAllDeferredUpdates();
        expect(runCount).toEqual(1);
    });

    it('Should run again if scheduled after processAllDeferredUpdates', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
        };
        ko.tasks.processDelayed(func, true, {args:[1]});
        expect(runValues).toEqual([]);

        ko.processAllDeferredUpdates();
        expect(runValues).toEqual([1]);

        ko.tasks.processDelayed(func, true, {args:[2]});

        jasmine.Clock.tick(50);
        expect(runValues).toEqual([1,2]);
    });

    it('Should run at the end of processImmediate', function() {
        var runCount = 0;

        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(function() {
                runCount++;
            });
            expect(runCount).toEqual(0);
        });
        expect(runCount).toEqual(1);
    });

    it('Should run at the end of processImmediate even if already scheduled outside (will run twice)', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
        };
        ko.tasks.processDelayed(func, true, {args:['o']});

        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['i']});
            expect(runValues).toEqual([]);
        });
        expect(runValues).toEqual(['i']);

        jasmine.Clock.tick(50);
        expect(runValues).toEqual(['i','o']);
    });

    it('Should run all scheduled tasks if processed early by processAllDeferredUpdates', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
        };
        ko.tasks.processDelayed(func, true, {args:['o']});

        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['i']});
            ko.processAllDeferredUpdates();
            expect(runValues).toEqual(['o','i']);
        });
    });

    it('Should ignore call to processAllDeferredUpdates during task processing', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
            ko.processAllDeferredUpdates();
        };
        ko.tasks.processDelayed(func, true, {args:['o']});

        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['i']});
            expect(runValues).toEqual([]);
        });
        // If ko.processAllDeferredUpdates wasn't ignored, then both tasks would have already run
        expect(runValues).toEqual(['i']);

        jasmine.Clock.tick(50);
        expect(runValues).toEqual(['i','o']);
    });

    it('Should process newly scheduled tasks during task processing', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
            ko.tasks.processDelayed(function() {
                runValues.push('x');
            });
        };

        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['i']});
            expect(runValues).toEqual([]);
        });
        expect(runValues).toEqual(['i','x']);
    });

    it('Should run at the end of each processImmediate when nested', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
        };
        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['o']});

            ko.tasks.processImmediate(function() {
                ko.tasks.processDelayed(func, true, {args:['i']});
                expect(runValues).toEqual([]);
            });
            expect(runValues).toEqual(['i']);
        });
        expect(runValues).toEqual(['i','o']);
    });

    it('Should keep correct state if task throws an exception', function() {
        var runValues = [];
        var func = function(value) {
            runValues.push(value);
        };
        ko.tasks.processImmediate(function() {
            ko.tasks.processDelayed(func, true, {args:['o']});

            expect(function() {
                ko.tasks.processImmediate(function() {
                    ko.tasks.processDelayed(func, true, {args:['i']});
                    ko.tasks.processDelayed(function() {
                        throw Error("test");
                    });
                    expect(runValues).toEqual([]);
                });
            }).toThrow();
            expect(runValues).toEqual(['i']);
        });
        expect(runValues).toEqual(['i','o']);
    });

});