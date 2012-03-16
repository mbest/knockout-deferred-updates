### **Deferred Updates** plugin for [Knockout](http://knockoutjs.com/)

This plugin/patch modifies parts of Knockout’s observable/subscription system to use **deferred updates**.

* **Automatically eliminates duplicate updates.** Instead of updating a computed observable immediately each time one of its dependencies change, this plugin defers updates to computed observables so that mulitple dependency changes are combined into a single update.
* **It just works.** This plugin is compatible with most applications built with Knockout. Just include it in the page after *Knockout* to provide an immediate performance boost.
* **Better than throttle:** Like the *throttle* feature, deferred updates are generally run asynchronously using `setTimeout`. But whereas throttled updates are each scheduled individually with separate `setTimeout` calls, deferred updates run all together using a single `setTimeout`.
* **Control when updates occur.** By default, deferred updates occur in a `setTimeout` callback. But the user can make updates happen earlier:
   * *Access a computed observable to update it.* A computed observable whose dependencies have changed is marked as *dirty* until it is updated. Accessing a *dirty* computed observable will cause it to update first.
   * *Use `processImmediate` to wrap data changes.* Before it returns, `processImmediate` performs any deferred updates that were triggered by the data changes.
   * *Use the `processDeferredBindingUpdates` functions to update bindings.* This plugin also defers UI updates since they use the same update system. If you have code that accesses the DOM directly and you’ve made data changes that will trigger a UI update, you’ll want to update the UI first. (See *Notes* below).
   * *Include `setImmediate` for faster updates.* This plugin will use [setImmediate](https://github.com/NobleJS/setImmediate), if available, which enables updates to run without the minimum delay enforced by `setTimeout` (4 ms on modern browsers, 10-15 ms on older browsers).

##### Examples

* [Nested Computed with plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-plugin.html)
* [Nested Computed without plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-noplugin.html)

##### New interfaces

1. `ko.tasks`
   * `processImmediate` takes three parameters: The first is the function you want it to run; next (optional) is the object the function should be called with (object will become `this` in the function); third (optional) is an array of values to pass to the function. By using `processImmediate` to call a function that updates observables, deferred updates to *dirtied* computed observables will be run as soon as your function completes. `processImmediate` will *not* run pending updates that were triggered before it was run. This allows nested calls to `processImmediate`.
   * `processDelayed` takes two parameters: The first is the function you want *delayed*; the second is a flag to ignore the function if it’s already scheduled. `ko.computed` uses `processDelayed` to schedule its own deferred updates.
   * `makeProcessedCallback` takes a single parameter, a function, and will return a new function that calls your function within `processImmediate`, passing along `this` and any arguments. This makes it easy to make existing callback functions (such as event handlers) use `processImmediate`.
2. `ko.computed`
   * `ko.computed.deferUpdates` is a boolean property. It’s set to *true* initially, making all computed observables use deferred updates. Set it to *false* to turn off global deferred updates.
   * `deferUpdates` is a boolean property of each computed observable instance; if set to *true* or *false*, it will override the global setting for that computed observable.
3. `ko.evaluateAsynchronously` is a replacement for `setTimeout` that will call the provided callback function within `ko.tasks.processImmediate`.
4. `ko.processDeferredBindingUpdatesForNode` and `ko.processAllDeferredBindingUpdates` provide a way to update the UI immediately. The first takes a *node* parameter and only processes updates for the specified node. The second processes all pending UI updates. You could use these functions if you have code that updates observables and then does direct DOM access, expecting it to be updated. Alternatively, you could wrap your observable updates in a call to `ko.tasks.processImmediate` (see above).

##### Notes

1. In addition to adding *deferred updates*, this plugin also includes these changes to `ko.computed`:
   1. `ko.computed` prevents recursive calls to itself.
   2. `ko.computed`, when accessed, will always return the latest value. Previously, computed observables that use throttling would return a stale value if the scheduled update hadn’t occurred yet. With this change, when a computed observable with a pending update is accessed, the update will occur immediately and the scheduled update will be canceled. This change affects computed observables that use either *throttle* or *defer* and thus improves the *throttle* feature when *throttled* computed observables depend on other *throttled* ones.
   3. The *throttle* extender will *either* delay evaluations or delay writes (but not both) based on whether the target observable is writable.
2. *Knockout* uses `ko.computed` internally to handle updates to bindings (so that updating an observable updates the UI). Because this plugin affects all computed observables, it defers binding updates too. This could be an advantage (fewer UI updates if bindings have multiple dependencies) or a disadvantage (slightly delayed updates). It also mean that this plugin will break code that assumes that the UI is updated immediately; that code will have to be modified to use either `processImmediate` to wrap the observable updates or one of the `DeferredBindingUpdates` functions before any direct DOM access.

Michael Best<br>
https://github.com/mbest/<br>
mbest@dasya.com
