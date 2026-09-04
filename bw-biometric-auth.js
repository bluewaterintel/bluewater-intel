/* Bluewater Intel — Face ID / Touch ID / fingerprint quick sign-in (native only).
 * Stores email + password in the OS secure vault (Keychain / Keystore), gated by
 * biometrics. Web/PWA is a no-op. Loaded after bw-capacitor.js + bw-auth.js. */
(function(){
  const SERVER = "com.bluewaterintel.app";
  const PREF_ENABLED = "bwi_biometric_login_v1";
  const BiometryType = { NONE: 0, TOUCH_ID: 1, FACE_ID: 2, FINGERPRINT: 3, FACE_AUTHENTICATION: 4 };

  function native(){ return !!(window.BW_NATIVE); }
  function plugin(){
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric;
  }
  async function prefGet(key){
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if(P){
      try { const { value } = await P.get({ key }); return value; } catch(e){ /* fall through */ }
    }
    try { return localStorage.getItem(key); } catch(e){ return null; }
  }
  async function prefSet(key, value){
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if(P){ try { await P.set({ key, value: value || "" }); return; } catch(e){ /* fall through */ } }
    try {
      if(value == null || value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch(e){ /* ignore */ }
  }

  let _avail = null; // cached isAvailable result

  async function isAvailable(){
    if(!native() || !plugin()) return { ok: false };
    if(_avail) return _avail;
    try {
      const r = await plugin().isAvailable();
      const ok = !!(r && (r.isAvailable || r.strongBiometryIsAvailable));
      _avail = { ok, biometryType: r && r.biometryType, deviceIsSecure: !!(r && r.deviceIsSecure) };
      return _avail;
    } catch(e){
      _avail = { ok: false };
      return _avail;
    }
  }

  function labelFromType(t){
    if(t === BiometryType.FACE_ID || t === BiometryType.FACE_AUTHENTICATION) return "Face ID";
    if(t === BiometryType.TOUCH_ID) return "Touch ID";
    if(t === BiometryType.FINGERPRINT || t === 6) return "Fingerprint";
    return "Biometrics";
  }

  async function methodLabel(){
    const a = await isAvailable();
    return labelFromType(a.biometryType);
  }

  async function isEnabled(){
    if(!native()) return false;
    return (await prefGet(PREF_ENABLED)) === "1";
  }

  async function setEnabled(on){
    await prefSet(PREF_ENABLED, on ? "1" : "");
    if(!on) await deleteCredentials();
  }

  async function hasSavedCredentials(){
    if(!native() || !plugin()) return false;
    try {
      const r = await plugin().isCredentialsSaved({ server: SERVER });
      return !!(r && r.isSaved);
    } catch(e){ return false; }
  }

  async function saveCredentials(email, password){
    const NB = plugin();
    if(!NB || !email || !password) return false;
    await NB.setCredentials({ username: email, password, server: SERVER });
    await setEnabled(true);
    return true;
  }

  async function deleteCredentials(){
    const NB = plugin();
    if(!NB) return;
    try { await NB.deleteCredentials({ server: SERVER }); } catch(e){ /* already gone */ }
  }

  async function signInWithBiometric(){
    const NB = plugin();
    if(!NB || !native()) throw new Error("Biometric sign-in is only available in the mobile app.");
    const a = await isAvailable();
    if(!a.ok) throw new Error("Biometric sign-in is not available on this device.");

    const saved = await hasSavedCredentials();
    if(!saved) throw new Error("Sign in with email and password once, then enable " + (await methodLabel()) + " in Manage Account.");

    const name = await methodLabel();
    await NB.verifyIdentity({
      reason: "Sign in to Bluewater Intel",
      title: "Sign in",
      subtitle: name,
      description: "Use " + name + " instead of typing your password",
      useFallback: false,
    });

    const creds = await NB.getCredentials({ server: SERVER });
    if(!creds || !creds.username || !creds.password) throw new Error("Saved sign-in not found. Sign in with your password and re-enable " + name + ".");

    if(!window.BW_AUTH || !window.BW_AUTH.signIn) throw new Error("Sign-in is still loading.");
    await window.BW_AUTH.signIn(creds.username, creds.password);
    return creds.username;
  }

  async function offerEnableAfterSignIn(email, password){
    if(!native() || !email || !password) return;
    const a = await isAvailable();
    if(!a.ok) return;
    if(await hasSavedCredentials() && await isEnabled()) return;

    const name = await methodLabel();
    const ok = confirm(
      "Use " + name + " next time?\n\n"
      + "Your sign-in will be saved in the " + (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === "ios" ? "iPhone" : "device")
      + " secure vault and only unlocked with " + name + ". You can turn this off anytime under Menu → Manage Account.",
    );
    if(!ok) return;
    try {
      await saveCredentials(email, password);
    } catch(e){
      console.warn("[biometric] enable failed", e);
    }
  }

  async function syncLoginButton(){
    const btn = document.getElementById("bw-auth-biometric");
    if(!btn) return;
    if(!native()){
      btn.style.display = "none";
      return;
    }
    const a = await isAvailable();
    const saved = a.ok && await hasSavedCredentials();
    if(!saved){
      btn.style.display = "none";
      return;
    }
    const name = await methodLabel();
    btn.textContent = "Sign in with " + name;
    btn.style.display = "block";
  }

  /** Optional one-shot auto-prompt when the sign-in gate opens. */
  async function tryAutoSignIn(){
    if(!native() || !await isEnabled() || !await hasSavedCredentials()) return false;
    if(window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser()) return false;
    try {
      await signInWithBiometric();
      return true;
    } catch(e){
      if(e && e.message && !/cancel/i.test(e.message)) console.warn("[biometric] auto sign-in", e.message);
      return false;
    }
  }

  async function renderAccountToggle(){
    const row = document.getElementById("acct-biometric-row");
    if(!row) return;
    if(!native()){
      row.style.display = "none";
      return;
    }
    const a = await isAvailable();
    if(!a.ok){
      row.style.display = "none";
      return;
    }
    const name = await methodLabel();
    const on = await isEnabled() && await hasSavedCredentials();
    row.style.display = "block";
    row.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:#6bbfea;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Quick sign-in</div>
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:#f0f6ff;margin-bottom:4px">${name}</div>
          <div style="font-size:12.5px;color:#9ec5e8;line-height:1.55">
            ${on
              ? "Enabled — use " + name + " on the sign-in screen instead of typing your password."
              : "Off — sign in with email and password once, then turn this on to skip typing next time."}
          </div>
        </div>
        <button type="button" id="acct-biometric-toggle" style="
          flex-shrink:0;font-family:inherit;font-size:12px;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;
          background:${on ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.06)"};
          border:1px solid ${on ? "rgba(52,211,153,.45)" : "rgba(107,191,234,.35)"};
          color:${on ? "#86efac" : "#6bbfea"}">${on ? "On" : "Enable"}</button>
      </div>`;
    const toggle = document.getElementById("acct-biometric-toggle");
    if(toggle){
      toggle.onclick = async () => {
        if(on){
          if(!confirm("Turn off " + name + " sign-in and remove saved credentials from this device?")) return;
          await setEnabled(false);
          renderAccountToggle();
          syncLoginButton();
          return;
        }
        const em = (document.getElementById("acct-email") || {}).textContent || "";
        if(!em){
          alert("Sign in with your password once, then return here to enable " + name + ".");
          return;
        }
        toggle.disabled = true;
        toggle.textContent = "…";
        try {
          await plugin().verifyIdentity({
            reason: "Enable quick sign-in",
            title: name,
            subtitle: "Bluewater Intel",
            description: "Confirm it's you to save sign-in for next time",
            useFallback: false,
          });
          const pass = prompt("Enter your Bluewater Intel password once to enable " + name + " on this device:");
          if(!pass || pass.length < 6){
            alert("Password is required to enable " + name + ".");
            return;
          }
          if(!window.BW_AUTH || !window.BW_AUTH.signIn){
            alert("Sign-in is not ready yet. Try again in a moment.");
            return;
          }
          await window.BW_AUTH.signIn(em.trim(), pass);
          await saveCredentials(em.trim(), pass);
          renderAccountToggle();
          syncLoginButton();
        } catch(e){
          alert((e && e.message) ? e.message : "Could not enable " + name + ".");
        } finally {
          toggle.disabled = false;
          toggle.textContent = on ? "On" : "Enable";
        }
      };
    }
  }

  window.BW_BIOMETRIC = {
    isAvailable,
    methodLabel,
    isEnabled,
    setEnabled,
    hasSavedCredentials,
    saveCredentials,
    deleteCredentials,
    signInWithBiometric,
    offerEnableAfterSignIn,
    syncLoginButton,
    tryAutoSignIn,
    renderAccountToggle,
  };
})();
