export const Ringtone = {
	_ctx: null, _interval: null, _active: false,

	start(type = 'incoming') {
		if (this._active) return;
		this._active = true;
		try {
			const AC = window.AudioContext || window.webkitAudioContext;
			if (!AC) return;
			this._ctx = new AC();
			this._pulse(type);
			this._interval = setInterval(() => this._pulse(type), type === 'incoming' ? 4200 : 4000);
		} catch (e) { console.warn('[Ringtone]', e); }
	},

	_pulse(type) {
		if (!this._ctx || !this._active) return;
		const ctx = this._ctx, t = ctx.currentTime;
		if (type === 'incoming') {
			[0, 0.55].forEach(offset => {
				[880, 960].forEach(freq => {
					const osc = ctx.createOscillator(), gain = ctx.createGain();
					osc.type = 'sine'; osc.frequency.value = freq;
					osc.connect(gain); gain.connect(ctx.destination);
					gain.gain.setValueAtTime(0, t + offset);
					gain.gain.linearRampToValueAtTime(0.13, t + offset + 0.01);
					gain.gain.setValueAtTime(0.13, t + offset + 0.36);
					gain.gain.linearRampToValueAtTime(0, t + offset + 0.43);
					osc.start(t + offset); osc.stop(t + offset + 0.45);
				});
			});
		} else {
			const osc = ctx.createOscillator(), gain = ctx.createGain();
			osc.type = 'sine'; osc.frequency.value = 440;
			osc.connect(gain); gain.connect(ctx.destination);
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
			gain.gain.setValueAtTime(0.06, t + 1.2);
			gain.gain.linearRampToValueAtTime(0, t + 1.3);
			osc.start(t); osc.stop(t + 1.35);
		}
	},

	stop() {
		this._active = false;
		if (this._interval) { clearInterval(this._interval); this._interval = null; }
		if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; }
	},
};
