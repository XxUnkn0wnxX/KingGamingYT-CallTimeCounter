const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'CallTimeCounter.plugin.js'), 'utf8');
const elementTag = Symbol('react.element');

function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

function harness(options = {}) {
    let now = 10000;
    let selected = 'local-voice';
    let nextInterval = 0;
    let currentResult;
    const intervals = new Map();
    const subscriptions = new Set();
    const listeners = new Set();
    const styles = new Map();
    const patches = new Set();
    const warnings = [];
    const searches = [];
    const updates = [];
    class Component {
        constructor(props) { this.props = props; }
        setState(update) {
            const previous = freeze(this.state);
            const partial = typeof update === 'function' ? update(previous, this.props) : update;
            assert.ok(partial && typeof partial === 'object' && !Array.isArray(partial), 'React state updates must return an object');
            updates.push({ previous, partial });
            this.state = { ...previous, ...partial };
        }
    }
    const React = {
        Component,
        createElement(type, config, ...children) {
            const props = { ...config };
            const key = props.key ?? null;
            delete props.key;
            if (children.length) props.children = children.length === 1 ? children[0] : children;
            return freeze({ $$typeof: elementTag, type, key, props });
        },
        cloneElement(element, config, ...children) {
            const props = { ...element.props, ...config };
            if (children.length) props.children = children.length === 1 ? children[0] : children;
            return freeze({ ...element, props });
        },
        isValidElement(value) { return value?.$$typeof === elementTag; }
    };
    // Representative private declaration: the exported caller reads the same
    // lexical binding that the declaration owner's setter updates.
    function RTCPanel(props) {
        const { hasRemoteVoiceState } = props;
        const childrenAsSubtitle = true;
        const menu = 'RTCConnectionMenu';
        void hasRemoteVoiceState; void childrenAsSubtitle; void menu;
        return currentResult;
    }
    const originalPanel = RTCPanel;
    const declarations = {};
    Object.defineProperty(declarations, 'uninitialized', { enumerable: true, get() { throw new ReferenceError('TDZ'); } });
    Object.defineProperty(declarations, 'privatePanel', {
        enumerable: true,
        get: () => RTCPanel,
        ...(options.readOnly ? {} : { set: value => { RTCPanel = value; } })
    });
    declarations.unrelated = function RouterLink() { return 'createHref defaultPrevented'; };
    const store = {
        getVoiceChannelId: () => selected,
        addChangeListener(callback) { listeners.add(callback); },
        removeChangeListener(callback) { listeners.delete(callback); }
    };
    if (options.noStoreListeners) delete store.addChangeListener;
    if (options.halfStoreListeners) delete store.removeChangeListener;
    const dispatcher = {
        dispatch() {}, register() {},
        subscribe(event, callback) {
            assert.equal(event, 'RTC_CONNECTION_STATE');
            subscriptions.add(callback);
            if (options.failSubscribe) throw new Error('subscribe failed');
        },
        unsubscribe(event, callback) {
            assert.equal(event, 'RTC_CONNECTION_STATE');
            subscriptions.delete(callback);
        }
    };
    const Webpack = {
        getModule(filter, search) {
            searches.push(search);
            assert.equal(filter({}), true);
            assert.equal(search.withKey, true);
            assert.equal(search.cacheId, 'CallTimeCounter-RTCPanel');
            if (options.noPanel) return undefined;
            if (options.wrongTarget) return [declarations, 'unrelated'];
            for (const key of Object.keys(declarations)) {
                let value;
                try { value = declarations[key]; } catch { continue; }
                if (search.declarationFilter(value)) return [declarations, key];
            }
        },
        getStore(name) {
            assert.equal(name, 'SelectedChannelStore');
            return options.noStore ? undefined : store;
        },
        getByKeys(...keys) {
            if (keys[0] === 'dispatch') return options.noDispatcher ? undefined : dispatcher;
            if (options.noCSS) return undefined;
            return keys[0] === 'rtcConnectionStatus'
                ? { rtcConnectionStatus: 'rtc-valid' }
                : { connection: 'connection-valid', inner: 'inner-valid', channel: undefined };
        }
    };
    const Patcher = {
        after(caller, owner, key, callback) {
            assert.equal(caller, 'CallTimeCounter');
            const original = owner[key];
            owner[key] = function (...args) {
                const result = original.apply(this, args);
                const replacement = callback(this, args, result);
                return replacement === undefined ? result : replacement;
            };
            const unpatch = () => { owner[key] = original; patches.delete(unpatch); };
            patches.add(unpatch);
            if (options.failPatch) throw new Error('patch failed after assignment');
            if (options.noPatchHandle) return undefined;
            return unpatch;
        },
        unpatchAll() { for (const unpatch of Array.from(patches)) unpatch(); }
    };
    const DOM = {
        addStyle(key, value) {
            styles.set(key, value);
            if (options.failStyle) throw new Error('style failed');
        },
        removeStyle(key) { styles.delete(key); }
    };
    const context = {
        module: { exports: {} }, BdApi: { React, Webpack, Patcher, DOM },
        console: { warn: value => warnings.push(value) },
        Date: class extends Date { static now() { return now; } },
        setInterval(callback, delay) {
            assert.equal(delay, 1000);
            const key = ++nextInterval;
            intervals.set(key, callback);
            return key;
        },
        clearInterval: key => intervals.delete(key)
    };
    if (options.noPatcher) delete context.BdApi.Patcher;
    vm.runInNewContext(source, context, { filename: 'CallTimeCounter.plugin.js' });
    const plugin = new context.module.exports();
    const h = React.createElement;
    // Saved HTTP renderer contract: RTC status > focus ring > channel link >
    // [conditional connection status, subtitle(label)]. All input is frozen.
    const label = h('Text', { variant: 'text-xs/medium', ref: 'label-ref' }, 'Voice / Server');
    const status = h('Text', { variant: 'text-md/medium' }, 'Connected');
    const subtitle = h('Subtitle', { className: 'subtitle', key: 'subtitle', ref: 'subtitle-ref' }, label);
    const link = h('RouterLink', { to: '/channels/guild/local-voice', onContextMenu() {}, ref: 'link-ref' }, [status, subtitle]);
    const focus = h('FocusRing', { ref: 'focus-ref' }, link);
    const fixture = h('RTCStatus', { childrenAsSubtitle: true, channelId: 'local-voice', ref: 'root-ref' }, focus);
    const props = freeze({ channel: { id: 'local-voice' }, hasRemoteVoiceState: false });
    return {
        plugin, context, React, fixture, props, label, status, searches, declarations,
        originalPanel, warnings, styles, patches, intervals, subscriptions, listeners, updates,
        run(result = fixture, input = props) { currentResult = result; return RTCPanel(input); },
        select(value, notify = true) { selected = value; if (notify) for (const callback of listeners) callback(); },
        advance(milliseconds) { now += milliseconds; for (const callback of Array.from(intervals.values())) callback(); },
        emit(event) { for (const callback of subscriptions) callback(event); },
        mount(element) { const timer = new element.type(element.props); timer.componentDidMount(); return timer; }
    };
}

function subtitleOf(result) { return result.props.children.props.children.props.children[1]; }
function timerOf(result) { return subtitleOf(result).props.children.at(-1); }
function assertClean(h) {
    for (const collection of [h.patches, h.intervals, h.subscriptions, h.listeners, h.styles]) assert.equal(collection.size, 0);
    assert.equal(h.plugin.active, false);
    assert.equal(h.plugin.timers.size, 0);
    assert.equal(h.plugin.channelId, null);
    assert.equal(h.plugin.startTime, null);
}

test('discovers the semantic private declaration and patches its writable lexical accessor', () => {
    const h = harness();
    h.plugin.start();
    assert.equal(h.warnings.length, 0);
    assert.equal(h.searches.length, 1);
    assert.notEqual(h.declarations.privatePanel, h.originalPanel);
    assert.equal(h.patches.size, 1);
    assert.equal(h.subscriptions.size, 1);
    assert.notEqual(h.run(), h.fixture);
    assert.ok(!h.styles.get('voiceTimer').includes('.undefined'));
    h.plugin.stop();
    assert.equal(h.declarations.privatePanel, h.originalPanel);
    assertClean(h);
});

test('immutable clones preserve Discord children, props and refs with one stable timer on repeated output', () => {
    const h = harness();
    h.plugin.start();
    const first = h.run();
    const second = h.run();
    const repeated = h.run(first);
    const timer = timerOf(first);
    assert.equal(timer.type, timerOf(second).type);
    assert.equal(timer.type, timerOf(repeated).type);
    assert.equal(timer.key, timerOf(repeated).key);
    for (const output of [first, second, repeated]) {
        assert.equal(subtitleOf(output).props.children.length, 2);
        assert.equal(subtitleOf(output).props.children[0], h.label);
        assert.equal(output.props.children.props.children.props.children[0], h.status);
        let before = h.fixture;
        let after = output;
        for (let level = 0; level < 3; level++) {
            assert.notEqual(after, before);
            assert.equal(after.type, before.type);
            assert.equal(after.props.ref, before.props.ref);
            for (const [key, value] of Object.entries(before.props)) if (key !== 'children') assert.equal(after.props[key], value);
            before = before.props.children;
            after = after.props.children;
        }
        assert.equal(subtitleOf(output).props.ref, 'subtitle-ref');
    }
    assert.equal(subtitleOf(h.fixture).props.children, h.label);
    assert.equal(Object.isFrozen(h.fixture), true);
    assert.equal(Object.isFrozen(h.props), true);
    const linkWithoutStatus = h.React.cloneElement(h.fixture.props.children.props.children, {}, [false, subtitleOf(h.fixture)]);
    const withoutStatus = h.React.cloneElement(h.fixture, {}, h.React.cloneElement(h.fixture.props.children, {}, linkWithoutStatus));
    const conditionalOutput = h.run(withoutStatus);
    assert.equal(conditionalOutput.props.children.props.children.props.children[0], false);
    assert.equal(subtitleOf(conditionalOutput).props.children[0], h.label);
    assert.equal(timerOf(conditionalOutput).type, timer.type);
    h.plugin.stop();
});

test('preserves additional Discord subtitle elements and removes only its own timer', () => {
    const h = harness();
    h.plugin.start();
    const first = h.run();
    const foreign = h.React.createElement('OtherPlugin', { key: 'other' });
    const sub = h.React.cloneElement(subtitleOf(first), {}, [h.label, foreign, timerOf(first), timerOf(first)]);
    const link = h.React.cloneElement(first.props.children.props.children, {}, [h.status, sub]);
    const input = h.React.cloneElement(first, {}, h.React.cloneElement(first.props.children, {}, link));
    const output = h.run(input);
    assert.equal(subtitleOf(output).props.children.length, 3);
    assert.equal(subtitleOf(output).props.children[0], h.label);
    assert.equal(subtitleOf(output).props.children[1], foreign);
    assert.equal(timerOf(output).type, timerOf(first).type);
    h.plugin.stop();
});

test('remote, other-channel, disconnected and unexpected render structures are untouched', () => {
    const h = harness();
    h.plugin.start();
    assert.equal(h.run(h.fixture, { ...h.props, hasRemoteVoiceState: true }), h.fixture);
    assert.equal(h.run(h.fixture, { channel: { id: 'another-voice' } }), h.fixture);
    h.select(null);
    assert.equal(h.run(), h.fixture);
    h.select('local-voice');
    const E = h.React.createElement;
    const shapes = [null, {}, E('Root', {}), E('Root', { childrenAsSubtitle: true }, 'text'),
        E('Root', { childrenAsSubtitle: true }, E('Focus', {}, E('Link', {}, []))),
        E('Root', { childrenAsSubtitle: true }, E('Focus', {}, E('Link', { onContextMenu() {} }, [false, null]))),
        E('Root', { childrenAsSubtitle: true }, E('Focus', {}, E('Link', { onContextMenu() {} }, [false, E('Subtitle', {}, 'unknown')])))];
    for (const shape of shapes) assert.equal(h.run(shape), shape);
    h.plugin.stop();
    assert.equal(h.run(), h.fixture);
});

test('missing discovery/modules and unwritable or unrelated owners fail softly without resources', () => {
    for (const options of [{ noPanel: true }, { readOnly: true }, { wrongTarget: true }, { noStore: true }, { noDispatcher: true }, { noPatcher: true }]) {
        const h = harness(options);
        assert.doesNotThrow(() => h.plugin.start());
        assert.equal(h.warnings.length, 1, JSON.stringify(options));
        assertClean(h);
        assert.equal(h.run(), h.fixture);
    }
});

test('partial startup failures roll back subscriptions, styles and even an assigned patch', () => {
    for (const options of [{ failSubscribe: true }, { failStyle: true }, { failPatch: true }, { noPatchHandle: true }]) {
        const h = harness(options);
        assert.doesNotThrow(() => h.plugin.start());
        assert.equal(h.warnings.length, 1, JSON.stringify(options));
        assertClean(h);
        assert.equal(h.declarations.privatePanel, h.originalPanel);
    }
});

test('optional CSS and store-listener modules do not prevent a working timer', () => {
    for (const options of [{ noCSS: true }, { noStoreListeners: true }, { halfStoreListeners: true }]) {
        const h = harness(options);
        h.plugin.start();
        assert.equal(h.warnings.length, 0);
        assert.ok(!h.styles.get('voiceTimer').includes('.undefined'));
        const timer = h.mount(timerOf(h.run()));
        h.advance(1000);
        assert.equal(timer.render().props.children, 'Time elapsed: 00:00:01');
        h.select('another-voice', false);
        h.advance(1000);
        assert.equal(timer.render().props.children, 'Time elapsed: 00:00:00');
        h.plugin.stop();
        assertClean(h);
    }
});

test('ticks with valid state updates, retains same-channel remount time and resets only non-stream disconnects', () => {
    const h = harness();
    h.plugin.start();
    const element = timerOf(h.run());
    const first = h.mount(element);
    assert.equal(first.render().props.children, 'Time elapsed: 00:00:00');
    h.advance(3000);
    assert.equal(first.render().props.children, 'Time elapsed: 00:00:03');
    const unmountedTick = Array.from(h.intervals.values())[0];
    first.componentWillUnmount();
    assert.equal(h.intervals.size, 0);
    const updatesAfterUnmount = h.updates.length;
    unmountedTick();
    assert.equal(h.updates.length, updatesAfterUnmount);
    h.advance(2000);
    const second = h.mount(element);
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:05');
    assert.equal(h.subscriptions.size, 1);
    h.emit({ state: 'RTC_DISCONNECTED', streamKey: undefined });
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:05');
    h.emit({ state: 'RTC_CONNECTED' });
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:05');
    h.emit({ state: 'RTC_DISCONNECTED' });
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:00');
    h.advance(2000);
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:02');
    h.select(null);
    assert.equal(second.render(), null);
    h.select('local-voice');
    assert.equal(second.render().props.children, 'Time elapsed: 00:00:00');
    h.plugin.stop();
    assertClean(h);
});

test('stop hides mounted timers immediately and invalidates late mounts and callbacks across restart', () => {
    const h = harness();
    h.plugin.start();
    const previousElement = timerOf(h.run());
    const mounted = h.mount(previousElement);
    const oldTick = Array.from(h.intervals.values())[0];
    const oldEvent = Array.from(h.subscriptions)[0];
    h.advance(4000);
    h.plugin.stop();
    assert.equal(mounted.render(), null);
    assert.equal(mounted.state.visible, false);
    assertClean(h);
    const late = h.mount(previousElement);
    assert.equal(late.render(), null);
    assertClean(h);
    h.plugin.start();
    assert.notEqual(timerOf(h.run()).type, previousElement.type);
    const staleAfterRestart = h.mount(previousElement);
    const updatesBeforeStaleTick = h.updates.length;
    oldTick();
    oldEvent({ state: 'RTC_DISCONNECTED' });
    assert.equal(h.updates.length, updatesBeforeStaleTick);
    assert.equal(staleAfterRestart.render(), null);
    assert.equal(mounted.render(), null);
    assert.equal(h.intervals.size, 0);
    const current = h.mount(timerOf(h.run()));
    h.advance(1000);
    assert.equal(current.render().props.children, 'Time elapsed: 00:00:01');
    h.plugin.start();
    assert.equal(current.render(), null);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.subscriptions.size, 1);
    assert.equal(h.listeners.size, 1);
    assert.equal(h.patches.size, 1);
    mounted.componentWillUnmount();
    late.componentWillUnmount();
    staleAfterRestart.componentWillUnmount();
    h.plugin.stop();
    h.plugin.stop();
    assertClean(h);
});
