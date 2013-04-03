### **Deferred Updates** plugin for [Knockout](http://knockoutjs.com/)

This plugin/patch modifies parts of Knockout’s observable/subscription system to use **deferred updates**.

* **Automatically eliminates duplicate updates.** Instead of updating a computed observable immediately each time one of its dependencies change, this plugin defers updates to computed observables so that mulitple dependency changes are combined into a single update. Manual subscriptions are also deferred so that multiple updates to the subscribed observable only result in a single update.
* **It just works.** This plugin is compatible with most applications built with Knockout. Just include it in the page after *Knockout* to provide an immediate performance boost.
* **Better than throttle:** Like the *throttle* feature, deferred updates are generally run asynchronously using `setTimeout`. But whereas throttled updates are each scheduled individually with separate `setTimeout` calls, deferred updates run all together using a single `setTimeout`.
* **Control when updates occur.** By default, deferred updates occur in a `setTimeout` callback. But the user can make updates happen earlier:
   * *Access a computed observable to update it.* A computed observable whose dependencies have changed is marked as *stale* until it is updated. Accessing a *stale* computed observable will cause it to update first.
   * *Use `ko.tasks.processImmediate` to wrap data changes.* Before it returns, `processImmediate` performs any deferred updates that were triggered by the data changes.
   * *Use `ko.processAllDeferredBindingUpdates` to update bindings.* This plugin also defers UI updates since they use the same update system. If you have code that accesses the DOM directly and you’ve made data changes that will trigger a UI update, you’ll want to update the UI first. (See *Notes* below).
   * *Include `setImmediate` for faster updates.* This plugin will use [setImmediate](https://github.com/NobleJS/setImmediate), if available, which enables updates to run without the minimum delay enforced by `setTimeout` (4 ms on modern browsers, 10-15 ms on older browsers).

##### Examples

* [Nested Computed without plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-noplugin.html)
* [Nested Computed with plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-plugin.html)

##### New interfaces

1. `ko.tasks`
   * `ko.tasks.processImmediate(evaluator, object, args)`

      By using `processImmediate` to call a function that updates observables, deferred updates to *dirtied* computed observables will be run as soon as your function completes. `processImmediate` will *not* run pending updates that were triggered before it was run. This allows nested calls to `processImmediate`. It takes three parameters: `evaluator` is the function you want to run; `object` (optional) is the object the function should be called with (object will become `this` in the function); `args` (optional) is an array of parameters to pass to the function.
   * `ko.tasks.processDelayed(evaluator, distinct)`

      `processDelayed` adds a function to the task queue. `ko.computed` uses `processDelayed` to schedule its own deferred updates. It takes two parameters: `evaluator` is the function you want queued; `distinct` (optional), if *true*, queues the function only if it’s not already queued.
   * `ko.tasks.makeProcessedCallback(callback)`

      `makeProcessedCallback` returns a new function that calls the `callback` function within `processImmediate`, passing along `this` and any arguments. This makes it easy to make existing callback functions (such as event handlers) use `processImmediate`.
2. `ko.computed`
   * `ko.computed.deferUpdates` is a boolean property. It’s set to *true* initially, making all computed observables use deferred updates. Set it to *false* to turn off global deferred updates.
   * `<computed>.deferUpdates` is a boolean property of each computed observable object that is initially *undefined*; if set to *true* or *false*, it will override the global setting for that computed observable.
   * `<computed>.getDependencies()` is a function that returns an array of observables that the computed observable depends on.
3. `<observable>.subscribe(callback, callbackTarget, event, deferUpdates)` includes a fourth, optional parameter, that, if *true* or *false*, will overrides the global deferred updates setting for that subscription.
4. `<observable>.getDependents()` is a new function that returns an array of computed observables that depend on this observable (or computed observable).
5. `ko.evaluateAsynchronously(callback, timeout)` is a replacement for `setTimeout` that will call the provided callback function within `ko.tasks.processImmediate`.
6. `ko.processAllDeferredBindingUpdates()` provides a way to update the UI immediately. This will process all pending UI updates. You could use this function if you have code that updates observables and then does direct DOM access, expecting it to be updated. Alternatively, you could wrap your observable updates in a call to `ko.tasks.processImmediate` (see above).

##### Notes

1. In addition to adding *deferred updates*, this plugin also includes these changes to `ko.computed`:
   1. `ko.computed`, when accessed, will always return the latest value. Previously, computed observables that use throttling would return a stale value if the scheduled update hadn’t occurred yet. With this change, when a computed observable with a pending update is accessed, the update will occur immediately and the scheduled update will be canceled. This change affects computed observables that use either *throttle* or *defer* and thus improves the *throttle* feature when *throttled* computed observables depend on other *throttled* ones.
   2. The *throttle* extender will *either* delay evaluations or delay writes (but not both) based on whether the target observable is writable.
2. *Knockout* uses `ko.computed` internally to handle updates to bindings (so that updating an observable updates the UI). Because this plugin affects all computed observables, it defers binding updates too. This could be an advantage (fewer UI updates if bindings have multiple dependencies) or a disadvantage (slightly delayed updates). It also mean that this plugin will break code that assumes that the UI is updated immediately; that code will have to be modified to use either `processImmediate` to wrap the observable updates or  `processAllDeferredBindingUpdates` before any direct DOM access.

Michael Best<br>
https://github.com/mbest/<br>
mbest@dasya.com
