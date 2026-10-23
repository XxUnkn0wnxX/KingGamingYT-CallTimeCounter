/**
 * @name CallTimeCounter
 * @author QWERT, KingGamingYT
 * @description Shows how much time you are in a voice chat.
 * @version 1.0.3
 */

const { React } = BdApi;
const PLUGIN = "CallTimeCounter";
const STYLE = "voiceTimer";

function matchesPanel(value) {
    if (typeof value !== "function") return false;
    const source = Function.prototype.toString.call(value);
    return ["RTCConnectionMenu", "childrenAsSubtitle", "hasRemoteVoiceState"].every(marker => source.includes(marker));
}

function timerCSS(Webpack) {
    const rtc = Webpack.getByKeys("rtcConnectionStatus", "ping");
    const panel = Webpack.getByKeys("connection", "inner");
    const valid = value => typeof value === "string" && /^[\w-]+$/.test(value);
    const classes = [rtc?.rtcConnectionStatus, panel?.inner, panel?.connection].filter(valid);
    let css = ".voiceTimer { margin-top: 4px; }";
    if (classes.length) css += `\n${classes.map(value => `.${value}`).join(", ")} { height: fit-content; }`;
    if (valid(panel?.channel)) {
        css += `\n.${panel.channel} { text-decoration: none !important; }`;
        css += `\n.${panel.channel} > div:nth-child(1):hover { text-decoration: underline; }`;
    }
    return css;
}

module.exports = class CallTimeCounter {
    constructor() {
        this.active = false;
        this.generation = 0;
        this.timers = new Set();
        this.channelId = null;
        this.startTime = null;
    }

    start() {
        this.stop();
        const generation = this.generation;
        const { Webpack, Patcher, DOM } = BdApi;
        try {
            if (!React?.Component || ![React.createElement, React.cloneElement, React.isValidElement,
                Webpack?.getModule, Webpack?.getStore, Webpack?.getByKeys,
                Patcher?.after, Patcher?.unpatchAll, DOM?.addStyle, DOM?.removeStyle].every(value => typeof value === "function")) {
                throw new Error("Required BetterDiscord APIs are unavailable.");
            }
            const target = Webpack.getModule(() => true, {
                declarationFilter: matchesPanel,
                withKey: true,
                cacheId: "CallTimeCounter-RTCPanel"
            });
            if (!Array.isArray(target) || target.length !== 2 || !target[0]) throw new Error("RTC voice panel was not found.");
            const [owner, key] = target;
            const descriptor = Object.getOwnPropertyDescriptor(owner, key);
            if (!matchesPanel(owner[key]) || !descriptor || !(descriptor.writable || typeof descriptor.set === "function")) {
                throw new Error("RTC voice panel cannot be patched.");
            }
            this.store = Webpack.getStore("SelectedChannelStore");
            this.dispatcher = Webpack.getByKeys("dispatch", "subscribe", "register", { searchExports: true });
            if (typeof this.store?.getVoiceChannelId !== "function" ||
                typeof this.dispatcher?.subscribe !== "function" || typeof this.dispatcher?.unsubscribe !== "function") {
                throw new Error("Voice connection modules are unavailable.");
            }

            const plugin = this;
            // A stable type for this activation, shared by every voice-panel render.
            this.Timer = class Timer extends React.Component {
                constructor(props) {
                    super(props);
                    this.state = { elapsed: 0, visible: false };
                    this.mounted = false;
                    this.refresh = this.refresh.bind(this);
                }

                refresh() {
                    if (!this.mounted || !plugin.active || plugin.generation !== generation) return;
                    const elapsed = plugin.elapsed(generation);
                    this.setState({ elapsed: elapsed ?? 0, visible: elapsed !== null });
                }

                componentDidMount() {
                    if (!plugin.active || plugin.generation !== generation) return;
                    this.mounted = true;
                    plugin.timers.add(this);
                    this.refresh();
                    this.interval = setInterval(this.refresh, 1000);
                }

                dispose(hide) {
                    this.mounted = false;
                    clearInterval(this.interval);
                    this.interval = null;
                    plugin.timers.delete(this);
                    if (hide) this.setState({ elapsed: 0, visible: false });
                }

                componentWillUnmount() {
                    this.dispose(false);
                }

                render() {
                    if (!plugin.active || plugin.generation !== generation || !this.state.visible) return null;
                    const seconds = Math.floor(this.state.elapsed / 1000);
                    const time = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
                        .map(value => String(value).padStart(2, "0")).join(":");
                    return React.createElement("div", { className: "voiceTimer" }, `Time elapsed: ${time}`);
                }
            };

            this.active = true;
            this.syncChannel();
            this.onConnection = event => {
                if (!this.active || this.generation !== generation || event?.state !== "RTC_DISCONNECTED" ||
                    Object.prototype.hasOwnProperty.call(event, "streamKey")) return;
                this.syncChannel();
                if (this.channelId !== null) this.startTime = Date.now();
                this.refreshTimers();
            };
            this.subscribed = true;
            this.dispatcher.subscribe("RTC_CONNECTION_STATE", this.onConnection);
            if (typeof this.store.addChangeListener === "function" && typeof this.store.removeChangeListener === "function") {
                this.onChannelChange = () => {
                    if (!this.active || this.generation !== generation) return;
                    this.syncChannel();
                    this.refreshTimers();
                };
                this.listening = true;
                this.store.addChangeListener(this.onChannelChange);
            }
            this.styled = true;
            DOM.addStyle(STYLE, timerCSS(Webpack));
            const unpatch = Patcher.after(PLUGIN, owner, key, (_that, [props], result) => {
                if (!this.active || this.generation !== generation) return;
                return this.addTimer(props, result);
            });
            if (typeof unpatch !== "function") throw new Error("RTC voice-panel patch registration failed.");
        }
        catch (error) {
            this.stop();
            console.warn(`[${PLUGIN}] Unable to start: ${error.message}`);
        }
    }

    syncChannel() {
        const selected = this.store.getVoiceChannelId() || null;
        if (selected !== this.channelId) {
            this.channelId = selected;
            this.startTime = selected === null ? null : Date.now();
        }
    }

    elapsed(generation) {
        if (!this.active || this.generation !== generation) return null;
        this.syncChannel();
        if (this.channelId === null) return null;
        return Math.max(0, Math.round((Date.now() - this.startTime) / 1000) * 1000);
    }

    refreshTimers() {
        for (const timer of this.timers) timer.refresh();
    }

    addTimer(props, result) {
        this.syncChannel();
        if (!this.channelId || props?.hasRemoteVoiceState || props?.channel?.id !== this.channelId) return;
        if (!React.isValidElement(result) || result.props.childrenAsSubtitle !== true) return;
        const focus = result.props.children;
        if (!React.isValidElement(focus)) return;
        const link = focus.props.children;
        if (!React.isValidElement(link) || typeof link.props.onContextMenu !== "function" || !Array.isArray(link.props.children)) return;
        const children = link.props.children;
        if (children.length !== 2 || !React.isValidElement(children[1])) return;
        const subtitle = children[1];
        const original = subtitle.props.children;
        const content = Array.isArray(original) ? original : [original];
        const label = content.filter(child => !(React.isValidElement(child) && child.type === this.Timer));
        if (!label.length || !label.every(child => React.isValidElement(child))) return;
        const nextSubtitle = React.cloneElement(subtitle, {}, [
            ...label, React.createElement(this.Timer, { key: "CallTimeCounter-timer" })
        ]);
        const nextLink = React.cloneElement(link, {}, [children[0], nextSubtitle]);
        return React.cloneElement(result, {}, React.cloneElement(focus, {}, nextLink));
    }

    stop() {
        this.active = false;
        this.generation++;
        for (const timer of Array.from(this.timers)) timer.dispose(true);
        // Attempt every cleanup even if one host API throws during shutdown.
        const cleanup = action => { try { action(); } catch {} };
        if (this.subscribed) cleanup(() => this.dispatcher.unsubscribe("RTC_CONNECTION_STATE", this.onConnection));
        if (this.listening) cleanup(() => this.store.removeChangeListener(this.onChannelChange));
        cleanup(() => BdApi.Patcher?.unpatchAll?.(PLUGIN));
        if (this.styled) cleanup(() => BdApi.DOM.removeStyle(STYLE));
        this.subscribed = this.listening = this.styled = false;
        this.channelId = this.startTime = null;
        this.store = this.dispatcher = this.Timer = this.onConnection = this.onChannelChange = null;
    }
};
