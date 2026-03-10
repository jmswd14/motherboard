// ── VANGUARD THEME ────────────────────────────────────────────────────────────
// Handles dark / light / system theme switching across all pages.
// Apply the theme immediately using the anti-FOUC inline script in <head>;
// this file provides the runtime API (cycle, sync, etc.).

window.VG_THEME = {

  apply: function(theme) {
    const isLight = theme === 'light' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    localStorage.setItem('vg-theme', theme);
    this.updateToggle(theme);
  },

  updateToggle: function(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const cfg = {
      dark:   { icon: '☾', label: 'Dark'   },
      light:  { icon: '☀', label: 'Light'  },
      system: { icon: '◑', label: 'System' },
    };
    const { icon, label } = cfg[theme] || cfg.dark;
    const iconEl  = btn.querySelector('.left-nav-icon');
    const labelEl = btn.querySelector('.left-nav-label');
    if (iconEl)  iconEl.textContent  = icon;
    if (labelEl) labelEl.textContent = label;
  },

  cycle: function() {
    const cur  = localStorage.getItem('vg-theme') || 'dark';
    const next = { dark: 'light', light: 'system', system: 'dark' };
    const t    = next[cur] || 'light';
    this.apply(t);
    // Fire-and-forget DB sync
    const client = window.supabaseClient;
    if (client) {
      client.auth.getUser().then(function(res) {
        const user = res.data && res.data.user;
        if (user) {
          client.from('user_preferences').upsert(
            { user_id: user.id, key: 'theme', value: t, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' }
          );
        }
      });
    }
  },

  sync: async function() {
    const client = window.supabaseClient;
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const { data } = await client
      .from('user_preferences')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'theme')
      .maybeSingle();
    if (data && data.value) {
      localStorage.setItem('vg-theme', data.value);
      this.apply(data.value);
    }
  },
};

document.addEventListener('DOMContentLoaded', function() {
  const t = localStorage.getItem('vg-theme') || 'dark';
  VG_THEME.updateToggle(t);

  // Re-apply when OS preference changes (only matters in system mode)
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
    if (localStorage.getItem('vg-theme') === 'system') {
      VG_THEME.apply('system');
    }
  });
});
