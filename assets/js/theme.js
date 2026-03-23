// ── MOTHERBOARD THEME ─────────────────────────────────────────────────────────
// Manages Color 1, Color 2, and Background theme.

window.VG_THEME = {

  computeSurfaces: function(hex) {
    function hexToRgb(h) {
      return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    }
    function toHex(r,g,b) {
      return '#' + [r,g,b].map(function(v){ return Math.min(255,Math.max(0,Math.round(v))).toString(16).padStart(2,'0'); }).join('');
    }
    function lighten(h, amt) {
      var rgb = hexToRgb(h);
      return toHex(rgb[0]+amt, rgb[1]+amt, rgb[2]+amt);
    }
    return {
      bg:       hex,
      surface:  lighten(hex, 10),
      surface2: lighten(hex, 17),
      surface3: lighten(hex, 24),
      border:   lighten(hex, 28),
      border2:  lighten(hex, 34),
    };
  },

  applyBg: function(hex) {
    var s = this.computeSurfaces(hex);
    var el = document.documentElement;
    el.style.setProperty('--bg',       s.bg);
    el.style.setProperty('--surface',  s.surface);
    el.style.setProperty('--surface2', s.surface2);
    el.style.setProperty('--surface3', s.surface3);
    el.style.setProperty('--border',   s.border);
    el.style.setProperty('--border2',  s.border2);
    localStorage.setItem('vg-bg',       s.bg);
    localStorage.setItem('vg-surface',  s.surface);
    localStorage.setItem('vg-surface2', s.surface2);
    localStorage.setItem('vg-surface3', s.surface3);
    localStorage.setItem('vg-border',   s.border);
    localStorage.setItem('vg-border2',  s.border2);
  },

  applyRetroColors: function(c1, c2) {
    var el = document.documentElement;
    el.style.setProperty('--retro-c1', c1);
    el.style.setProperty('--retro-c2', c2);
    localStorage.setItem('vg-retro-c1', c1);
    localStorage.setItem('vg-retro-c2', c2);
  },

  sync: async function() {
    var client = window.supabaseClient;
    if (!client) return;
    var userRes = await client.auth.getUser();
    if (!userRes.data.user) return;
    var { data } = await client
      .from('user_preferences')
      .select('key,value')
      .eq('user_id', userRes.data.user.id)
      .in('key', ['retro_color1', 'retro_color2', 'bg_color']);
    if (!data) return;
    var prefs = {};
    data.forEach(function(r) { prefs[r.key] = r.value; });
    if (prefs.retro_color1) localStorage.setItem('vg-retro-c1', prefs.retro_color1);
    if (prefs.retro_color2) localStorage.setItem('vg-retro-c2', prefs.retro_color2);
    var c1 = localStorage.getItem('vg-retro-c1') || '#00FF41';
    var c2 = localStorage.getItem('vg-retro-c2') || '#FF6600';
    this.applyRetroColors(c1, c2);
    var bg = prefs.bg_color || localStorage.getItem('vg-bg') || '#000000';
    this.applyBg(bg);
  },

};

document.addEventListener('DOMContentLoaded', function() {
  var c1 = localStorage.getItem('vg-retro-c1') || '#00FF41';
  var c2 = localStorage.getItem('vg-retro-c2') || '#FF6600';
  VG_THEME.applyRetroColors(c1, c2);
  var bg = localStorage.getItem('vg-bg') || '#000000';
  VG_THEME.applyBg(bg);
});
