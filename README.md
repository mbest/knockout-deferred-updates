**Deferred Updates** plugin for [Knockout](http://knockoutjs.com/)

This plugin/patch replaces `ko.computed` (and `ko.dependentObservable`) with a new version that supports **deferred updates**. Unlike the *throttle* feature, which schedules each update using individual `setTimeout` calls, *defer* schedules all updates to run together and eliminates duplicate updates.

*Deferred updates* uses a new object called `ko.tasks` to handle the scheduling. `ko.tasks` has three options for scheduling (fastest to slowest):

1. If your code that updates observables is called using `ko.tasks.processImmediate`, `ko.tasks` will run all deferred updates immediately after your code completes.
2. If you include [setImmediate](https://github.com/NobleJS/setImmediate), `ko.tasks` will use it to schedule the updates. `setImmediate` enables the browser to run the updates immediately after all pending events (and UI updates (except in IE 8 and lower)) are processed.
3. As a last option, it will use `setTimeout` to schedule the updates. Since the updates are run using a single `setTimout`, the maximum delay will be the minimum `setTimout` interval (4 ms on modern browsers, 10-15 ms on older browsers).

In addition to adding *deferred updates*, this plugin also includes these changes to `ko.computed`:

1. `ko.computed` prevents recursive calls to itself.
2. `ko.computed`, when accessed, will always return the latest value. Previously, computed observables that use throttling would return a stale value if the scheduled update hadn’t occurred yet. With this change, when a computed observable with a pending update is accessed, the update will occur immediately and the scheduled update will be canceled. This change affects computed observables that use either *throttle* or *defer* and thus improves the *throttle* feature when *throttled* computed observables depend on other *throttled* ones.
3. The *throttle* extender will *either* delay evaluations or delay writes (but not both) based on whether the target observable is writable.

Examples:

* [Nested Computed with plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-plugin.html)
* [Nested Computed without plugin](http://mbest.github.com/knockout-deferred-updates/examples/nested-computed-noplugin.html)

Here are the new interfaces in this plugin:

1. `ko.tasks`
   * `processImmediate` takes three parameters: The first is the function you want it to run; next (optional) is the object the function should be called with (object will become `this` in the function); third (optional) is an array of values to pass to the function. By using `processImmediate` to call a function that updates observables, deferred updates to *dirtied* computed observables will be run as soon as your function completes. `processImmediate` will *not* run pending updates that were triggered before it was run. This allows nested calls to `processImmediate`.
   * `processDelayed` takes two parameters: The first is the function you want *delayed*; the second is a flag to ignore the function if it’s already scheduled. `ko.computed` uses `processDelayed` to schedule its own deferred updates.
   * `makeProcessedCallback` takes a single parameter, a function, and will return a new function that calls your function within `processImmediate`, passing along `this` and any arguments. This makes it easy to make existing callback functions (such as event handlers) use `processImmediate`.
2. `ko.computed`
   * `ko.computed.deferUpdates` is a boolean property. It’s set to *true* initially, making all computed observables use deferred updates. Set it to *false* to turn off global deferred updates.
   * `deferUpdates` is a boolean property of each computed observable instance; if set to *true* or *false*, it will override the global setting for that computed observable.
3. `ko.evaluateAsynchronously` is a replacement for `setTimeout` that will call the provided callback function within `ko.tasks.processImmediate`.
4. `ko.processDeferredBindingUpdatesForNode` and `ko.processAllDeferredBindingUpdates` provide a way to update the UI immediately. The first takes a *node* parameter and only processes updates for the specified node. The second processes all pending UI updates. You could use these functions if you have code that updates observables and then does direct DOM access, expecting it to be updated. Alternatively, you could wrap your observable updates in a call to `ko.tasks.processImmediate` (see above).

Notes:

* *Knockout* uses `ko.computed` internally to handle updates to bindings (so that updating an observable updates the UI). Because this plugin affects all computed observables, it defers binding updates too. This could be an advantage (fewer UI updates if bindings have multiple dependencies) or a disadvantage (slightly delayed updates). It also mean that this plugin will break code that assumes that the UI is updated immediately; that code will have to be modified to use either `processImmediate` to wrap the observable updates or one of the `DeferredBindingUpdates` functions before any direct DOM access.

Michael Best
https://github.com/mbest/
mbest@dasya.com
