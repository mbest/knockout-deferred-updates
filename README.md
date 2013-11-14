### **Deferred Updates** plugin for [Knockout](http://knockoutjs.com/)

This plugin/patch modifies parts of Knockout’s observable/subscription system to use **deferred updates**.

* **Automatically eliminates duplicate updates.** Instead of updating a computed observable immediately each time one of its dependencies change, this plugin defers updates to computed observables so that mulitple dependency changes are combined into a single update. Manual subscriptions are also deferred so that multiple updates to the subscribed observable only result in a single update.
* **It just works.** This plugin is compatible with most applications built with Knockout. Just include it in the page after *Knockout* to provide an immediate performance boost.
* **Better than throttle:** Like the *throttle* feature, deferred updates are generally run asynchronously using `setTimeout`. But whereas throttled updates are each scheduled individually with separate `setTimeout` calls, deferred updates run all together using a single `setTimeout`.

#### Download

* Minified: [knockout-deferred-updates.min.js](http://mbest.github.io/knockout-deferred-updates/knockout-deferred-updates.min.js)
* Source: [knockout-deferred-updates.js](http://mbest.github.io/knockout-deferred-updates/knockout-deferred-updates.js)
* Via [NPM](https://npmjs.org/package/knockout-deferred-updates): `npm install knockout-deferred-updates`
* Via [NuGet](https://www.nuget.org/packages/Knockout.DeferredUpdates): `nuget install knockout.DeferredUpdates`

#### Turning deferred updates on or off

If you want to use deferred updates for only specific instances, you can turn it off globally and then turn it on for specific computed observables or subscriptions:

```javascript
// Turn *off* deferred updates for computed observables and subscriptions
ko.computed.deferUpdates = false;

var myComputed = ko.computed(function () {...});
// Turn *on* deferred updates for this computed observable
myComputed.deferUpdates = true;

var myObservable = ko.observable();
var mySubscription = myObservable.subscribe(function(value) {...});
// Turn *on* deferred updates for this subscription
mySubscription.deferUpdates = true;
```

Similarly, you can turn off deferred updates for a specific computed observable or subscription by setting `deferUpdates` to `false`. If it’s more convenient, you can use the `deferred` extender instead of setting the `deferUpdates` property:

```javascript
// Turn *off* deferred updates for this computed observable
var myComputed = ko.computed(function () {...}).extend({ deferred:false });
```

#### Controlling when updates occur

By default, deferred updates occur in a `setTimeout` callback. But you can make updates happen earlier:

* *Access a computed observable to update it.* A computed observable whose dependencies have changed is marked as *stale* until it is updated. Accessing a *stale* computed observable will cause it to update first.

* *Use `ko.tasks.processImmediate` to wrap data changes.* Before it returns, `processImmediate` performs any deferred updates that were triggered by the data changes. (See *Scheduling tasks* below.)

* *Use `ko.processAllDeferredBindingUpdates` to update bindings.* This plugin also defers UI updates since they use the same update system. If you have code that accesses the DOM directly and you’ve made data changes that will trigger a UI update, you’ll want to update the UI first. (See *Notes* below.)

* *Include `setImmediate` for faster updates.* This plugin will use [setImmediate](https://github.com/NobleJS/setImmediate), if available, which enables updates to run without the minimum delay enforced by `setTimeout` (4 ms on modern browsers, 10-15 ms on older browsers).

#### Scheduling tasks

This plugin includes a task scheduler that queues deferred tasks to be processed after the currently running program context is complete. This is used internally for updating computed observables and subscriptions. You can also directly add deferred tasks and alter the task context through the `ko.tasks` interface.

   * `ko.tasks.processImmediate(evaluator[, object[, args]])`

      `processImmediate` runs the given function within a new task context. Any tasks scheduled within the function will be processed as soon as the function completes. `processImmediate` will *not* run tasks that were scheduled before it was run. It also supports nested calls. `processImmediate` takes three parameters: `evaluator` is the function you want to run; `object` (optional) is the object the function should be called with (object will become `this` in the function); `args` (optional) is an array of parameters to pass to the function.

   * `ko.tasks.processDelayed(evaluator[, options])`

      `processDelayed` adds a function to the task queue. If a function is added more than once within the current task context, its place in the queue is simply moved to the end (unless the `distinct` option is *false*). `processDelayed` takes two parameters: `evaluator` is the function you want queued; `options` (optional) can include the following parameters: `distinct` (default is *true*), if *false*, queues the function without checking if it’s already queued, `object` is the object the function should be called with, and `args` is an array of parameters to pass to the function.

   * `ko.tasks.makeProcessedCallback(callback)`

      `makeProcessedCallback` returns a new function that will call the `callback` function within a new task context (using `processImmediate`), passing along `this` and any arguments. This makes it easy to modify existing callback functions (such as event handlers) use separate task contexts.

#### Examples

* [Nested Computed without plugin](http://mbest.github.io/knockout-deferred-updates/examples/nested-computed-noplugin.html)
* [Nested Computed with plugin](http://mbest.github.io/knockout-deferred-updates/examples/nested-computed-plugin.html)

#### Notes

In addition to adding *deferred updates*, this plugin includes the following changes to Knockout’s observable system.

1. Computed observables use an `equalityComparer` function to determine whether their value has actually changed and only notify if the value has changed (non-primitive values [object, array, etc.] are considered always changed). You can modify the behavior for all computed observables by setting `ko.computed.fn.equalityComparer` to a new function (or `null` to consider all values as different) that compares the two values *(old, new)* and returns *false* if they’re different. You can modify a computed observable instance by setting its `equalityComparer` property or by using the `notify` extender (e.g. `ko.computed(...).extend({notify:'always'})`).

2. *Knockout* uses `ko.computed` internally to handle updates to bindings (so that updating an observable updates the UI). Because this plugin affects all computed observables, it defers binding updates too. This is generally an advantage  because of fewer UI updates, but it can be a problem if you have code that assumes that the UI is updated immediately. That code will have to be modified to use `ko.tasks.processImmediate` to do the observable updates in an inner task context, or to use `ko.processAllDeferredBindingUpdates` before any direct DOM access; `ko.processAllDeferredBindingUpdates` will immediately process all pending updates (in any task context) that directly or indirectly affect a UI binding.

3. A computed observable, when accessed, always returns the latest value. If the computed observable has a pending update, it is updated immediately, and the scheduled update is canceled. This affects both *deferred* and *throttled* computed observables.

4. The *throttle* extender *either* delays evaluations or delays writes (but not both) based on whether the target observable is writable.

5. There are two new functions that allow you to access the observable dependency tree. Each computed observable includes `getDependencies` that returns an array of the observables it depends on. And each observable includes `getDependents` that returns an array of the computed observables that depend on it.

6. The subscription notification system flattens recursive notifications. So if a notification causes other notifications, those happen after the former notification is complete. This makes it possible to have a large computed observable dependency depth without causing errors. The idea for this change came from @haberman’s [Knockout pull request](https://github.com/knockout/knockout/pull/359).

7. The dependency detection system assigns ids to observables and uses objects to track distinct dependencies. This improves performance especially for computed observables with a lot of dependencies and in older browsers that don’t have an efficient `inArray` function. The idea for this change came from @coderenaissance and @sciolizer.

License: MIT (http://www.opensource.org/licenses/mit-license.php)

Michael Best<br>
https://github.com/mbest/<br>
mbest@dasya.com
