/**
 * dsh-ammeter client half — compact subscription quota indicator beside
 * the conversation model selector.
 *
 * Authored directly in the DSH client module format (window.__ModuleLoader__).
 * The Host half remains the source of truth for credentials, caching and
 * refresh scheduling; this half reads only the plugin-owned JSON endpoints.
 */
window.__ModuleLoader__.load({
	id: "dsh-ammeter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const createElement = react.createElement;

		// `slots` is the root service; `modelDirectories` is resolved in the
		// session-scoped inject below so every composer observes its own model.
		const inject = ["slots"];
		const POLL_MS = 15000;

		// Provider id -> account id. Mirrors the Host-side registry
		// (src/accounts.ts); the two halves ship as separate bundles.
		const PROVIDER_ACCOUNT = {
			"minimax": "minimax-global",
			"minimax-cn": "minimax-cn",
			"opencode-go": "opencode-go",
			"zai": "glm",
			"zai-coding-plan": "glm",
			"zai-coding-cn": "glm",
			"glm": "glm",
			"glm-cn": "glm",
			"zhipu": "glm",
			"bigmodel": "glm",
		};
		const ACCOUNT_SHORT = {
			"minimax-global": "国际站",
			"minimax-cn": "国内站",
			"opencode-go": "OpenCode Go",
			"glm": "GLM 套餐",
		};

		const css = [
			// === inline quota cell ===
			".am_inline_host{display:inline-flex;position:relative;flex:none;align-items:center;height:28px;margin:0 2px;z-index:1}",
			".am_inline{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;width:70px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#8b93a1);cursor:pointer;font:inherit;line-height:1;user-select:none;transition:background .14s ease,opacity .14s ease,transform .14s ease}",
			".am_inline:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
			".am_inline:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#8ea3ff)}",
			".am_inline:active{transform:scale(.98)}",
			".am_inline[data-busy=true]{background:color-mix(in srgb,#818cf8 12%,transparent)}",
			".am_inline_rows{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:70px}",
			".am_inline_line{display:inline-flex;align-items:center;gap:4px;width:70px;height:6px}",
			".am_inline_label{display:inline-block;width:18px;color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:9px;font-weight:600;line-height:10px;text-align:right;letter-spacing:.01em}",
			".am_inline_track{display:block;width:48px;height:6px;border-radius:999px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.28));overflow:hidden}",
			".am_inline_fill{display:block;height:100%;min-width:0;border-radius:inherit;transition:width .45s cubic-bezier(.3,.7,.4,1),background-color .2s ease}",
			".am_inline_fill.ok{background:var(--dsw-alias-state-success-primary,#22c55e)}",
			".am_inline_fill.warn{background:var(--dsw-alias-state-warn-primary,#f59e0b)}",
			".am_inline_fill.danger{background:var(--dsw-alias-state-error-primary,#ef4444)}",
			".am_inline_fill.muted{background:var(--dsw-alias-label-tertiary,#64748b);opacity:.55}",
			".am_inline_fill.loading{width:55%;background:linear-gradient(90deg,#7c8cff,#a5b4fc,#7c8cff);background-size:200% 100%;animation:am_inline_loading 1.4s ease-in-out infinite}",
			"@keyframes am_inline_loading{0%{background-position:100% 0;opacity:.42}50%{opacity:.9}100%{background-position:0 0;opacity:.42}}",

			// === compact tooltip ===
			".am_inline_tip{pointer-events:none;position:absolute;right:0;bottom:calc(100% + 7px);width:296px;box-sizing:border-box;padding:12px 13px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#fff) 18%,transparent);border-radius:13px;background:var(--dsw-alias-bg-overlay,#16181d);color:var(--dsw-alias-label-primary,#e8eaed);box-shadow:0 14px 34px rgba(0,0,0,.28);z-index:1000;line-height:1.35}",
			".am_inline_tip_head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}",
			".am_inline_tip_title{font-size:12px;font-weight:700;letter-spacing:-.01em}",
			".am_inline_tip_sub{margin-top:2px;color:var(--dsw-alias-label-secondary,#8b93a1);font-size:10px}",
			".am_inline_tip_live{color:var(--dsw-alias-label-secondary,#8b93a1);font-size:10px;white-space:nowrap}",
			".am_inline_tip_error{margin:0 0 8px;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,#f43f5e 13%,transparent);color:#fda4af;font-size:10px;line-height:1.45}",
			".am_inline_tip_empty{padding:8px 2px;color:var(--dsw-alias-label-secondary,#8b93a1);font-size:10px;text-align:center}",
			".am_inline_account{margin-top:7px;padding:8px 9px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#fff) 7%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#fff) 9%,transparent)}",
			".am_inline_account:first-of-type{margin-top:0}",
			".am_inline_account_selected{border-color:color-mix(in srgb,#818cf8 38%,transparent)}",
			".am_inline_account_head{display:flex;align-items:center;gap:6px;margin-bottom:6px}",
			".am_inline_chip{padding:2px 6px;border-radius:999px;background:color-mix(in srgb,#818cf8 16%,transparent);color:#a5b4fc;font-size:9px;font-weight:700}",
			".am_inline_account_name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;font-weight:650}",
			".am_inline_stale{margin-left:auto;color:#fbbf24;font-size:9px;white-space:nowrap}",
			".am_inline_account_error{margin:0 0 6px;color:#fda4af;font-size:10px;line-height:1.4}",
			".am_inline_model{margin-top:6px}",
			".am_inline_model:first-of-type{margin-top:0}",
			".am_inline_model_name{margin-bottom:4px;color:var(--dsw-alias-label-secondary,#8b93a1);font-size:9.5px;font-weight:650;text-transform:uppercase;letter-spacing:.02em}",
			".am_inline_metric{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:2px;color:var(--dsw-alias-label-secondary,#8b93a1);font-size:10px}",
			".am_inline_metric b{color:var(--dsw-alias-label-primary,#f4f6f9);font-size:10px;font-weight:700;font-variant-numeric:tabular-nums}",
			".am_inline_hint{margin-top:8px;padding-top:7px;border-top:1px dashed color-mix(in srgb,var(--dsw-alias-border-l1,#fff) 14%,transparent);color:var(--dsw-alias-label-secondary,#8b93a1);font-size:9.5px;line-height:1.45}",
		].join("");

		if (typeof document !== "undefined") {
			const existing = document.querySelector('style[data-plugin-css="dsh-ammeter"]');
			if (existing) {
				existing.textContent = css;
			} else {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-ammeter";
				tag.dataset.pluginCss = "dsh-ammeter";
				tag.textContent = css;
				document.head.appendChild(tag);
			}
		}

		function api(path, options) {
			return fetch("/dsh-ammeter/api" + path, {
				headers: { "Content-Type": "application/json" },
				...options,
			}).then(async (resp) => ({
				ok: resp.ok,
				status: resp.status,
				body: await resp.json().catch(() => ({})),
			}));
		}

		function accountOfProvider(provider) {
			if (typeof provider !== "string" || provider.length === 0) return undefined;
			return PROVIDER_ACCOUNT[provider];
		}

		function toneOf(percent) {
			if (typeof percent !== "number" || Number.isNaN(percent)) return "muted";
			if (percent < 20) return "danger";
			if (percent < 50) return "warn";
			return "ok";
		}

		function formatPercent(percent) {
			if (typeof percent !== "number" || Number.isNaN(percent)) return "—";
			return Math.round(percent) + "%";
		}

		function formatCountdown(endAt) {
			if (!endAt) return "";
			const remain = endAt - Date.now();
			if (remain <= 0) return "已重置";
			const totalMin = Math.floor(remain / 60000);
			const days = Math.floor(totalMin / (60 * 24));
			const hours = Math.floor((totalMin % (60 * 24)) / 60);
			const mins = totalMin % 60;
			if (days > 0) return days + "天" + hours + "小时";
			if (hours > 0) return hours + "小时" + mins + "分";
			if (mins > 0) return mins + "分";
			return Math.max(1, Math.floor(remain / 1000)) + "秒";
		}

		function formatFetchedAt(ts) {
			if (!ts) return "";
			try {
				return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			} catch {
				return "";
			}
		}

		function windowsOf(entry) {
			return entry && Array.isArray(entry.windows) ? entry.windows : [];
		}

		/**
		 * The account of the currently selected provider, and the row inside it
		 * that matches the selected model (MiniMax reports per model; the other
		 * subscriptions report a single account-level row).
		 */
		function accountForSelection(accounts, accountId, modelId) {
			const account = (accounts || []).find((item) => item && item.id === accountId);
			if (!account) return { account: undefined, entry: undefined };
			const entries = Array.isArray(account.entries) ? account.entries : [];
			const wanted = typeof modelId === "string" ? modelId.toLowerCase() : "";
			const exact = wanted
				? entries.find((item) => item && String(item.name).toLowerCase() === wanted)
				: undefined;
			const fallback =
				entries.find((item) => item && item.included !== false) || entries[0];
			return { account, entry: exact || fallback };
		}

		function useUsage(enabled, accountId) {
			const [data, setData] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [tick, setTick] = react.useState(0);
			const requestSeq = react.useRef(0);

			const load = react.useCallback((force) => {
				if (!enabled) return Promise.resolve();
				const seq = ++requestSeq.current;
				if (force) setBusy(true);
				return api(force ? "/refresh" : "/status", force ? { method: "POST" } : undefined)
					.then((response) => {
						if (seq !== requestSeq.current || !enabled) return;
						if (response.body && typeof response.body === "object") setData(response.body);
					})
					.catch(() => {})
					.finally(() => {
						if (seq === requestSeq.current && force) setBusy(false);
					});
			}, [enabled, accountId]);

			react.useEffect(() => {
				++requestSeq.current;
				if (!enabled) {
					setData(null);
					setBusy(false);
					return undefined;
				}
				load(false);
				return () => { ++requestSeq.current; };
			}, [enabled, accountId, load]);

			react.useEffect(() => {
				if (!enabled) return undefined;
				const id = setInterval(() => load(false), POLL_MS);
				return () => clearInterval(id);
			}, [enabled, accountId, load]);

			react.useEffect(() => {
				if (!enabled) return undefined;
				const id = setInterval(() => setTick((value) => value + 1), 30000);
				return () => clearInterval(id);
			}, [enabled]);

			return { data, busy, load, tick };
		}

		function CompactQuotaLine(props) {
			const percent = typeof props.percent === "number" && !Number.isNaN(props.percent)
				? Math.max(0, Math.min(100, props.percent))
				: undefined;
			const tone = props.loading ? "muted" : (props.included === false ? "muted" : toneOf(percent));
			const fillClass = "am_inline_fill " + (props.loading ? "loading" : tone);
			const width = props.loading ? undefined : (props.included === false || percent === undefined ? "0%" : percent + "%");
			return createElement("span", { className: "am_inline_line", "aria-hidden": "true" },
				createElement("span", { className: "am_inline_label" }, props.label),
				createElement("span", { className: "am_inline_track" },
					createElement("span", { className: fillClass, style: width === undefined ? undefined : { width } }),
				),
			);
		}

		function detailMetric(label, percent, included, reset) {
			const value = included === false ? "未包含" : formatPercent(percent);
			return createElement("div", { className: "am_inline_metric" },
				createElement("span", null, label + (reset ? " · " + reset : "")),
				createElement("b", null, value),
			);
		}

		function DetailPanel(props) {
			const accounts = Array.isArray(props.accounts) ? props.accounts : [];
			const data = props.data;
			const loading = !data || data.phase === "init";
			const selected = accounts.find((account) => account && account.id === props.accountId);
			const title = (selected && selected.label) || "订阅用量";
			const sub = selected ? (ACCOUNT_SHORT[selected.id] || "") : "";
			return createElement("div", { className: "am_inline_tip", role: "tooltip", id: props.id },
				createElement("div", { className: "am_inline_tip_head" },
					createElement("div", null,
						createElement("div", { className: "am_inline_tip_title" }, title),
						createElement("div", { className: "am_inline_tip_sub" }, sub),
					),
					createElement("span", { className: "am_inline_tip_live" },
						props.busy ? "刷新中…" : (loading ? "读取中…" : (data.fetchedAt ? "更新于 " + formatFetchedAt(data.fetchedAt) : "")),
					),
				),
				data && data.error ? createElement("div", { className: "am_inline_tip_error" }, data.error) : null,
				loading && accounts.length === 0
					? createElement("div", { className: "am_inline_tip_empty" }, props.busy ? "正在刷新用量…" : "正在读取用量…")
					: null,
				accounts.map((account) => createElement("div", {
					className: "am_inline_account" + (account.id === props.accountId ? " am_inline_account_selected" : ""),
					key: account.id,
				},
					createElement("div", { className: "am_inline_account_head" },
						createElement("span", { className: "am_inline_chip" }, ACCOUNT_SHORT[account.id] || account.id),
						createElement("span", { className: "am_inline_account_name" }, account.planName || account.label || "订阅套餐"),
						account.stale ? createElement("span", { className: "am_inline_stale" }, "可能过期") : null,
					),
					account.error ? createElement("div", { className: "am_inline_account_error" }, account.error) : null,
					(Array.isArray(account.entries) ? account.entries : []).map((entry) => createElement("div", { className: "am_inline_model", key: entry.name },
						createElement("div", { className: "am_inline_model_name" }, entry.name),
						windowsOf(entry).map((window) => detailMetric(
							window.title || window.label,
							window.remainingPercent,
							entry.included,
							formatCountdown(window.endAt),
						)),
					)),
				)),
				createElement("div", { className: "am_inline_hint" }, "点击立即刷新 · 仅当前订阅 provider 显示"),
			);
		}

		function UsageIndicator(props) {
			const directory = props.directory;
			const directoryState = react.useSyncExternalStore(
				(listener) => directory.subscribe(listener),
				() => directory.getSnapshot(),
				() => directory.getSnapshot(),
			);
			const current = directoryState && directoryState.current;
			const accountId = directoryState && directoryState.status === "ready"
				? accountOfProvider(current && current.provider)
				: undefined;
			const enabled = accountId !== undefined;
			const { data, busy, load, tick } = useUsage(enabled, accountId);
			void tick;
			const [hovered, setHovered] = react.useState(false);
			const [focused, setFocused] = react.useState(false);
			const tooltipId = react.useId();

			if (!enabled) return null;

			const accounts = data && Array.isArray(data.accounts) ? data.accounts : [];
			const selected = accountForSelection(accounts, accountId, current && current.model);
			const account = selected.account;
			const entry = selected.entry;
			const windows = windowsOf(entry);
			const loading = !data || data.phase === "init";
			const error = (account && account.error) || (data && data.error);
			const accountName = (account && account.label) || ACCOUNT_SHORT[accountId] || "订阅用量";
			const summary = loading
				? accountName + " 用量读取中"
				: error && windows.length === 0
					? accountName + " 用量异常：" + error
					: accountName + "：" + windows.map((window) =>
						(window.title || window.label) + "剩余 " + formatPercent(window.remainingPercent)
					).join("，") + "；点击刷新";
			const showTooltip = hovered || focused;
			return createElement("span", {
				className: "am_inline_host",
				"data-dsh-ammeter": "true",
				"data-dsh-ammeter-provider": current && current.provider,
				"data-dsh-ammeter-account": accountId,
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false),
			},
				createElement("button", {
					type: "button",
					className: "am_inline",
					"aria-label": summary,
					"aria-busy": busy || loading ? "true" : "false",
					"aria-describedby": showTooltip ? tooltipId : undefined,
					title: summary,
					"data-busy": busy ? "true" : undefined,
					onClick: () => { void load(true); },
					onFocus: () => setFocused(true),
					onBlur: () => setFocused(false),
				},
					createElement("span", { className: "am_inline_rows" },
						(windows.length > 0 ? windows.slice(0, 3) : [
							{ key: "placeholder-1", label: "", remainingPercent: undefined },
							{ key: "placeholder-2", label: "", remainingPercent: undefined },
						]).map((window) => createElement(CompactQuotaLine, {
							key: window.key,
							label: window.label,
							percent: window.remainingPercent,
							included: entry && entry.included,
							loading,
						})),
					),
				),
				showTooltip ? createElement(DetailPanel, {
					id: tooltipId,
					data,
					accounts,
					busy,
					accountId,
				}) : null,
			);
		}

		function apply(ctx) {
			if (!ctx || typeof ctx.inject !== "function") return;
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				if (!scope || !scope.slots || !scope.modelDirectories) return;
				scope.slots.inject("conversation.input.right", () => scope.slots.register({
					name: "conversation.input.right",
					id: "ammeter",
					order: 30,
					label: "订阅用量",
					inject: (sessionId) => ({
						directory: scope.modelDirectories.directoryFor(sessionId).store,
					}),
				}, UsageIndicator));
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
