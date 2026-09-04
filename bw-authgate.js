/* Bluewater Intel — Auth-gate UI wiring (sign in/out, plan onboarding)
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

(function(){
  const gate = document.getElementById("bw-auth-gate");
  const msg = document.getElementById("bw-auth-msg");
  const welcome = document.getElementById("bw-auth-welcome");
  const emailEl = document.getElementById("bw-auth-email");
  const passEl = document.getElementById("bw-auth-password");
  const forgotEl = document.getElementById("bw-auth-forgot");
  // Tracks which signed-in user we've already run the one-time plan-onboarding
  // check for, so background auth re-fires don't re-prompt for a plan.
  let _planOnboardCheckedFor = null;

  function showErr(t){ msg.textContent=t; msg.style.color="#fca5a5"; msg.style.display="block"; }
  function showOk(t){
    const resetSent = document.getElementById("bw-auth-reset-sent");
    if(resetSent){ resetSent.style.display = "none"; }
    msg.textContent=t; msg.style.color="#86efac"; msg.style.display="block";
  }
  function showResetSentBanner(){
    if(welcome) welcome.style.display="none";
    msg.style.display="none";
    const resetSent = document.getElementById("bw-auth-reset-sent");
    if(resetSent) resetSent.style.display="block";
    showGate();
  }
  function showWelcomeBanner(){
    if(welcome) welcome.style.display="block";
    showGate();
  }
  function hideGate(){
    if(gate) gate.style.display="none";
    resetAuthKbPad(gate);
    syncAuthScreenBodyClass();
  }
  function showGate(){
    if(gate) gate.style.display="flex";
    syncAuthScreenBodyClass();
    if(window.BW_BIOMETRIC){
      try { window.BW_BIOMETRIC.syncLoginButton(); } catch(e){ /* non-fatal */ }
      setTimeout(() => {
        if(gate && gate.style.display !== "none" && window.BW_BIOMETRIC && window.BW_BIOMETRIC.tryAutoSignIn){
          window.BW_BIOMETRIC.tryAutoSignIn().catch(() => {});
        }
      }, 450);
    }
  }
  // Other modules (billing offline handler, plan picker) must not hide the gate
  // unless a real Supabase session exists.
  window.showAuthGate = showGate;
  window.hideAuthGate = hideGate;
  window.syncAuthScreenBodyClass = syncAuthScreenBodyClass;
  function enforceAuthGate(){
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(u) return;
    const ca = document.getElementById("create-account-page");
    const pw = document.getElementById("password-recovery-page");
    const caOpen = ca && ca.style.display !== "none";
    const pwOpen = pw && pw.style.display !== "none";
    if(caOpen || pwOpen) return;
    showGate();
  }
  function sessionStill(user){
    const live = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    return !!(live && user && live.id === user.id);
  }

  // iOS Capacitor sets scrollEnabled:false for the map, which blocks scrolling when
  // the keyboard covers auth fields. Re-enable scroll on auth screens and nudge
  // focused inputs into view.
  let _kbListenerBound = false;
  // Deliberately no Keyboard.setScroll() here. Toggling the WKWebView scroll view
  // at runtime moves its content offset out from under our position:fixed overlay,
  // so buttons render in one place but hit-test in another.
  function authScreensOpen(){
    const ca = document.getElementById("create-account-page");
    const pw = document.getElementById("password-recovery-page");
    const verify = document.getElementById("verify-email-page");
    const verifyOpen = verify && verify.style.display !== "none";
    return (gate && gate.style.display !== "none")
      || (ca && ca.style.display !== "none")
      || (pw && pw.style.display !== "none")
      || verifyOpen;
  }
  function syncAuthScreenBodyClass(){
    try {
      document.body.classList.toggle("bw-auth-screen-open", authScreensOpen());
    } catch(e){ /* non-fatal */ }
  }
  function keyboardHeightPx(){
    const vv = window.visualViewport;
    if(vv) return Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
    return 0;
  }
  function resetAuthKeyboardLayout(root){
    if(!root) return;
    root.classList.remove("auth-kb-open");
    root.style.top = "";
    root.style.left = "";
    root.style.right = "";
    root.style.bottom = "";
    root.style.height = "";
    root.style.setProperty("--auth-kb-pad", "0px");
  }
  function resetAuthKbPad(root){ resetAuthKeyboardLayout(root); }
  function authGateUsesPinnedActions(root){
    return !!(window.BW_NATIVE && root && root.classList && root.classList.contains("auth-gate-shell"));
  }
  function scrollAuthGateField(root, el){
    const scroller = root.querySelector(".auth-gate-scroll");
    if(!scroller || !el) return;
    const sr = scroller.getBoundingClientRect();
    const ar = el.getBoundingClientRect();
    const pad = 12;
    if(ar.bottom > sr.bottom - pad) scroller.scrollTop += ar.bottom - sr.bottom + pad;
    else if(ar.top < sr.top + pad) scroller.scrollTop -= sr.top + pad - ar.top;
  }
  function pinAuthGateToViewport(root){
    if(!root || !authGateUsesPinnedActions(root)) return;
    const vv = window.visualViewport;
    if(!vv){
      resetAuthKeyboardLayout(root);
      return;
    }
    const kb = keyboardHeightPx();
    const inputFocused = root.querySelector("input:focus,textarea:focus,select:focus");
    if(kb > 50 || inputFocused){
      root.classList.add("auth-kb-open");
      root.style.top = Math.max(0, vv.offsetTop || 0) + "px";
      root.style.left = "0";
      root.style.right = "0";
      root.style.bottom = "auto";
      root.style.height = vv.height + "px";
      const active = document.activeElement;
      if(active && root.contains(active)) scrollAuthGateField(root, active);
    } else {
      resetAuthKeyboardLayout(root);
    }
  }
  function applyAuthKbHeight(h){
    if(!window.BW_NATIVE) return;
    const px = Math.max(0, Number(h) || 0);
    document.querySelectorAll(".auth-fullscreen").forEach((root) => {
      if(root.style.display === "none") return;
      if(authGateUsesPinnedActions(root)){
        pinAuthGateToViewport(root);
        return;
      }
      if(px > 50){
        root.classList.add("auth-kb-open");
        root.style.bottom = px + "px";
        root.style.setProperty("--auth-kb-pad", (px + 80) + "px");
      } else {
        resetAuthKeyboardLayout(root);
      }
    });
  }
  function syncAuthKbPad(root){
    if(!root) return;
    if(authGateUsesPinnedActions(root)){
      pinAuthGateToViewport(root);
      return;
    }
    const kb = keyboardHeightPx();
    if(kb > 50) applyAuthKbHeight(kb);
    else resetAuthKeyboardLayout(root);
  }
  function visibleBottomPx(){
    const vv = window.visualViewport;
    if(vv) return vv.height + (vv.offsetTop || 0);
    return window.innerHeight;
  }
  function ensureAuthTailVisible(root){
    const tail = root.querySelector("#bw-auth-signup, #ca-submit, #pw-submit");
    if(!tail) return;
    const pad = 12;
    const vis = visibleBottomPx();
    const tailRect = tail.getBoundingClientRect();
    if(tailRect.bottom > vis - pad){
      root.scrollTop += tailRect.bottom - vis + pad;
    }
  }
  function scrollAuthFieldIntoView(el){
    if(!el) return;
    const root = el.closest(".auth-fullscreen");
    if(!root) return;
    syncAuthKbPad(root);
    if(authGateUsesPinnedActions(root)){
      const doScroll = () => {
        pinAuthGateToViewport(root);
        scrollAuthGateField(root, el);
      };
      requestAnimationFrame(doScroll);
      setTimeout(doScroll, 120);
      setTimeout(doScroll, 360);
      return;
    }
    if(!window.BW_NATIVE && root.classList.contains("auth-gate-shell")) return;
    const doScroll = () => {
      try {
        syncAuthKbPad(root);
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const visibleBottom = Math.min(rootRect.bottom, visibleBottomPx());
        const pad = 16;
        if(elRect.bottom > visibleBottom - pad){
          root.scrollTop += elRect.bottom - visibleBottom + pad;
        } else if(elRect.top < rootRect.top + pad){
          root.scrollTop -= rootRect.top + pad - elRect.top;
        }
        ensureAuthTailVisible(root);
      } catch(e){
        try { el.scrollIntoView({ block: "nearest", behavior: "auto" }); } catch(e2){}
      }
    };
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 120);
    setTimeout(doScroll, 360);
  }
  // Capacitor's web implementation of addListener() returns a Promise, but the
  // native iOS bridge returns a plain { remove } handle. Chaining .catch() on it
  // throws a TypeError, so always feature-check before treating it as a promise.
  function addNativeListener(target, event, handler){
    const h = target.addListener(event, handler);
    if(h && typeof h.catch === "function") h.catch(() => {});
  }
  function bindKeyboardHeightListeners(){
    if(_kbListenerBound) return;
    const K = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(!K || !K.addListener) return;
    _kbListenerBound = true;
    addNativeListener(K, "keyboardWillShow", (info) => {
      applyAuthKbHeight(info && info.keyboardHeight);
      const active = document.activeElement;
      if(active && active.matches && active.matches("input,textarea,select")){
        scrollAuthFieldIntoView(active);
      }
    });
    addNativeListener(K, "keyboardWillHide", () => {
      applyAuthKbHeight(0);
      document.querySelectorAll(".auth-fullscreen").forEach(resetAuthKeyboardLayout);
    });
    addNativeListener(K, "keyboardDidShow", () => {
      if(gate && gate.style.display !== "none") pinAuthGateToViewport(gate);
    });
  }
  function wireAuthFormScroll(root){
    if(!root || root._bwKbWired) return;
    root._bwKbWired = true;
    const onResize = () => syncAuthKbPad(root);
    if(window.visualViewport){
      window.visualViewport.addEventListener("resize", onResize);
      window.visualViewport.addEventListener("scroll", onResize);
    }
    root.querySelectorAll("input, textarea, select").forEach((el) => {
      el.addEventListener("focus", () => {
        scrollAuthFieldIntoView(el);
      });
      el.addEventListener("blur", () => {
        setTimeout(() => {
          const active = document.activeElement;
          if(!root.contains(active) || !(active && active.matches && active.matches("input,textarea,select"))){
            if(keyboardHeightPx() <= 50) resetAuthKeyboardLayout(root);
          }
        }, 120);
      });
    });
    if(authGateUsesPinnedActions(root)) pinAuthGateToViewport(root);
  }
  // Keyboard/scroll polish is optional. It must never throw past this point,
  // because everything below — including wiring the Sign In and Create Account
  // buttons — lives in the same script. A TypeError here previously aborted the
  // whole file on iOS and shipped a login screen with dead buttons.
  function safeInit(label, fn){
    try { fn(); }
    catch(e){
      try { console.error("[authgate] " + label + " failed:", e); } catch(e2){ /* ignore */ }
    }
  }
  safeInit("keyboard listeners", bindKeyboardHeightListeners);
  safeInit("gate form scroll", () => wireAuthFormScroll(gate));
  safeInit("signup form scroll", () => wireAuthFormScroll(document.getElementById("create-account-page")));
  safeInit("recovery form scroll", () => wireAuthFormScroll(document.getElementById("password-recovery-page")));

  function hideBootChrome(){
    if(typeof window.BW_hideNativeSplash !== "function") return;
    try {
      const r = window.BW_hideNativeSplash();
      if(r && typeof r.catch === "function") r.catch(() => {});
    } catch(e){ /* never let splash teardown break auth */ }
  }

  async function onSignedIn(user, event){
    if(!user || !user.id){ enforceAuthGate(); return; }
    if(typeof USER_PREFS !== "undefined"){
      USER_PREFS.account = {
        name: (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split("@")[0] : "Captain"),
        email: user.email || "",
      };
    }
    if(typeof renderAccountSection === "function") renderAccountSection();
    const fullHydrate = !event || event === "INITIAL_SESSION" || event === "SIGNED_IN";
    if(fullHydrate && typeof window.bwOnSignedIn === "function"){
      try { await window.bwOnSignedIn(user); } catch(e){ console.error(e); }
    } else if(typeof window.bwRefreshSessionState === "function"){
      try { await window.bwRefreshSessionState(); } catch(e){ console.error(e); }
    }
    // FREE TIER (Model B): every signed-in user reaches the app. Entitlement
    // (trial / active subscription / owner) unlocks the PRO features — the Bite
    // Map, ocean layers, waypoints, fishing reports, and the AI brief — while
    // free users get the baseline app (maps, major areas, ports, catches,
    // closures, catch-measure, regs) with those PRO features shown but locked.
    // We still refresh entitlement so the correct gating is applied, but we no
    // longer trap unentitled users on the plan picker.
    try {
      if(typeof refreshEntitlement === "function") await refreshEntitlement();
    } catch(e){}
    // Plan onboarding is a ONE-TIME step. Supabase re-fires onAuthChange
    // (SIGNED_IN / TOKEN_REFRESHED) whenever the tab regains focus, which used
    // to re-run the check and re-open the plan picker every time a free user
    // switched away and came back. Evaluate it only once per signed-in user for
    // this page session; on later re-fires just make sure the app is visible.
    if(_planOnboardCheckedFor === user.id){
      const pg = document.getElementById("plan-gate");
      const planOpen = pg && pg.style.display && pg.style.display !== "none";
      if(!planOpen && sessionStill(user)) hideGate();
      else if(!sessionStill(user)) enforceAuthGate();
      return;
    }
    _planOnboardCheckedFor = user.id;  // set BEFORE awaiting so concurrent re-fires can't double-open
    let showPlan = false;
    if(typeof navigator === "undefined" || navigator.onLine !== false){
      try {
        if(typeof window.needsPlanOnboarding === "function") showPlan = await window.needsPlanOnboarding();
      } catch(e){}
    }
    if(showPlan && typeof window.openPostSignupPlans === "function"){
      window.openPostSignupPlans();
      return;
    }
    if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
    if(!sessionStill(user)){ enforceAuthGate(); return; }
    hideGate();
    if(typeof maybeShowFirstLoginOnboarding === "function"){
      try { await maybeShowFirstLoginOnboarding(user); } catch(e){}
    }
  }

  let _wireAttempts = 0;
  function wireAuth(){
    if(!window.BW_AUTH){
      _wireAttempts++;
      if(_wireAttempts > 50){
        hideBootChrome();
        enforceAuthGate();
        return;
      }
      setTimeout(wireAuth, 100);
      return;
    }
    window.BW_AUTH.onAuthChange(async (user, event) => {
      if(user){
        hideBootChrome();
        await onSignedIn(user, event);
      }
      // Don't flash the sign-in gate while the saved session is still loading.
      else if(window.BW_AUTH.isAuthInitDone && window.BW_AUTH.isAuthInitDone()){
        hideBootChrome();
        enforceAuthGate();
      }
    });
    window.BW_AUTH.whenReady().then(async (session) => {
      hideBootChrome();
      // Validate persisted session — stale tokens must not skip the sign-in gate.
      let user = session && session.user ? session.user : null;
      if(user && typeof navigator !== "undefined" && navigator.onLine !== false){
        try {
          const { data: { user: live }, error } = await window.BW_AUTH._sb.auth.getUser();
          if(error || !live){
            try { await window.BW_AUTH.signOut(); } catch(e){}
            user = null;
          } else {
            user = live;
          }
        } catch(e){
          user = null;
        }
      }
      if(!user) enforceAuthGate();
    }).catch(() => {
      hideBootChrome();
      enforceAuthGate();
    });
  }
  wireAuth();

  // Safety net: if anything hid the gate while unsigned, put it back.
  function authWatchdog(){
    if(window.BW_AUTH && window.BW_AUTH.isAuthInitDone && !window.BW_AUTH.isAuthInitDone()) return;
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(u) return;
    if(gate && gate.style.display === "none") enforceAuthGate();
  }
  setTimeout(authWatchdog, 1200);
  setTimeout(authWatchdog, 3500);

  // Email-confirmation return: ?confirmed=1 on the sign-in gate.
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("confirmed") === "1") {
      history.replaceState({}, "", location.origin + location.pathname);
      const handleConfirmedReturn = async () => {
        // If Supabase auto-established a session from the confirmation link (the
        // common case), the user is now signed in and hasn't picked a plan yet —
        // send them STRAIGHT to the Choose Your Plan screen rather than flashing
        // the sign-in page first. onSignedIn also handles this, but we invoke the
        // plan picker directly here so there's no sign-in-gate flash in between.
        if (window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser()) {
          let showPlan = false;
          try { if(typeof window.needsPlanOnboarding === "function") showPlan = await window.needsPlanOnboarding(); } catch(e){}
          if(showPlan && typeof window.openPostSignupPlans === "function"){
            if(typeof hideGate === "function") hideGate();
            window.openPostSignupPlans();
          }
          return;  // signed in → onSignedIn handles the rest
        }
        // No auto-session (they must sign in manually) → show the welcome banner
        // on the sign-in screen so they know their email is confirmed.
        showWelcomeBanner();
      };
      if (window.BW_AUTH) {
        setTimeout(handleConfirmedReturn, 600);
      } else {
        const waitAuth = setInterval(() => {
          if (!window.BW_AUTH) return;
          clearInterval(waitAuth);
          setTimeout(handleConfirmedReturn, 400);
        }, 100);
      }
    }
    if (q.get("recovery") === "1") {
      history.replaceState({}, "", location.origin + location.pathname);
      const handleRecoveryReturn = () => {
        if (typeof window.openPasswordRecoveryModal === "function") {
          window.openPasswordRecoveryModal();
        }
      };
      if (window.BW_AUTH) {
        setTimeout(handleRecoveryReturn, 600);
      } else {
        const waitAuth = setInterval(() => {
          if (!window.BW_AUTH) return;
          clearInterval(waitAuth);
          setTimeout(handleRecoveryReturn, 400);
        }, 100);
      }
    }
  } catch (e) {}

  // Basic field validation so an empty submit can't fall through to an
  // anonymous sign-in attempt (which the project disables → confusing error).
  function validCreds(){
    const em = emailEl.value.trim();
    if(!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ showErr("Enter a valid email address."); return null; }
    if(!passEl.value || passEl.value.length < 6){ showErr("Enter your password (at least 6 characters)."); return null; }
    return { email: em, password: passEl.value };
  }

  async function doBiometricSignIn(){
    msg.style.display="none";
    const btn = document.getElementById("bw-auth-biometric");
    if(btn){ btn.disabled = true; btn.textContent = "Checking…"; }
    try {
      if(!window.BW_BIOMETRIC || !window.BW_BIOMETRIC.signInWithBiometric){
        showErr("Biometric sign-in is not available.");
        return;
      }
      const email = await window.BW_BIOMETRIC.signInWithBiometric();
      if(emailEl && email) emailEl.value = email;
    } catch(e){
      if(e && e.code === "EMAIL_NOT_CONFIRMED" && typeof window.showVerifyEmailScreen === "function"){
        const em = emailEl && emailEl.value ? emailEl.value.trim() : "";
        if(em) window.showVerifyEmailScreen(em);
      }
      const m = (e && e.message) ? e.message : "Biometric sign-in failed";
      if(!/cancel/i.test(m)) showErr(m);
    } finally {
      if(btn && window.BW_BIOMETRIC && window.BW_BIOMETRIC.methodLabel){
        window.BW_BIOMETRIC.methodLabel().then((name) => {
          btn.disabled = false;
          btn.textContent = "Sign in with " + name;
        }).catch(() => { btn.disabled = false; btn.textContent = "Sign in with biometrics"; });
      } else if(btn){
        btn.disabled = false;
        btn.textContent = "Sign in with biometrics";
      }
    }
  }

  async function doSignIn(){
    msg.style.display="none";
    const c = validCreds(); if(!c) return;
    const btn = document.getElementById("bw-auth-signin");
    if(btn){ btn.disabled = true; btn.textContent = "Signing in…"; }
    try {
      if(!window.BW_AUTH || !window.BW_AUTH.signIn){
        showErr("Sign-in is still loading. Check your connection and try again.");
        return;
      }
      await window.BW_AUTH.signIn(c.email, c.password);
      if(window.BW_BIOMETRIC && window.BW_BIOMETRIC.clearSkipAutoSignIn){
        try { await window.BW_BIOMETRIC.clearSkipAutoSignIn(); } catch(e){}
      }
      if(window.BW_BIOMETRIC && window.BW_BIOMETRIC.offerEnableAfterSignIn){
        try { await window.BW_BIOMETRIC.offerEnableAfterSignIn(c.email, c.password); } catch(e){}
        try { await window.BW_BIOMETRIC.syncLoginButton(); } catch(e2){}
      }
    } catch(e){
      if(e && e.code === "EMAIL_NOT_CONFIRMED" && typeof window.showVerifyEmailScreen === "function"){
        const em = emailEl && emailEl.value ? emailEl.value.trim() : "";
        if(em) window.showVerifyEmailScreen(em);
      }
      showErr(e.message || "Sign in failed");
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = "Sign In"; }
    }
  }
  function openCreateAccountLocal(){
    const p = document.getElementById("create-account-page");
    const m = document.getElementById("ca-msg");
    if(m){ m.style.display = "none"; m.textContent = ""; }
    const em = document.getElementById("bw-auth-email");
    const caEm = document.getElementById("ca-email");
    if(em && caEm && em.value) caEm.value = em.value.trim();
    if(gate) gate.style.display = "none";
    if(p) p.style.display = "flex";
    syncAuthScreenBodyClass();
  }
  function openSignup(){
    if(typeof window.openCreateAccount === "function") window.openCreateAccount();
    else openCreateAccountLocal();
  }
  async function doForgot(){
    msg.style.display="none";
    const em = emailEl.value.trim();
    if(!em) return showErr("Enter your email above first, then tap Forgot password.");
    if(!window.BW_AUTH || !window.BW_AUTH.resetPassword){
      showErr("Sign-in is still loading. Check your connection and try again.");
      return;
    }
    try {
      await window.BW_AUTH.resetPassword(em);
      showResetSentBanner();
    } catch(err){ showErr(err?.message || "Could not send reset email."); }
  }

  const AUTH_ACTION_SEL = "#bw-auth-signin,#bw-auth-biometric,#bw-auth-signup,#bw-auth-forgot";
  const AUTH_ACTIONS = {
    "bw-auth-signin": doSignIn,
    "bw-auth-biometric": doBiometricSignIn,
    "bw-auth-signup": openSignup,
    "bw-auth-forgot": doForgot,
  };
  // One shared debounce: the same tap can arrive via inline onclick, the element
  // listener, and the coordinate fallback below.
  let _lastAuthAction = 0;
  function runAuthAction(id, e){
    const fn = AUTH_ACTIONS[id];
    if(!fn) return;
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const now = Date.now();
    if(now - _lastAuthAction < 600) return;
    _lastAuthAction = now;
    fn();
  }
  window.bwAuthGateSignIn = (e) => runAuthAction("bw-auth-signin", e);
  window.bwAuthGateBiometric = (e) => runAuthAction("bw-auth-biometric", e);
  window.bwAuthGateOpenSignup = (e) => runAuthAction("bw-auth-signup", e);
  window.bwAuthGateForgot = (e) => runAuthAction("bw-auth-forgot", e);
  if(!window.closeCreateAccount){
    window.closeCreateAccount = function(){
      const p = document.getElementById("create-account-page");
      if(p) p.style.display = "none";
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!u) enforceAuthGate();
      else syncAuthScreenBodyClass();
    };
  }
  Object.keys(AUTH_ACTIONS).forEach((id) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener("click", (e) => runAuthAction(id, e));
  });
  // iOS fallback: if the WebView routes the touch to a scroll layer instead of the
  // button, recover the intended target from the touch coordinates.
  if(gate){
    gate.addEventListener("touchend", (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if(!t) return;
      const direct = e.target && e.target.closest && e.target.closest(AUTH_ACTION_SEL);
      let hit = direct;
      if(!hit){
        const at = document.elementFromPoint(t.clientX, t.clientY);
        hit = at && at.closest ? at.closest(AUTH_ACTION_SEL) : null;
      }
      if(hit) runAuthAction(hit.id, e);
    }, { passive: false });
  }
  // Let the user submit with Enter from either the email or password field,
  // instead of forcing a click on the Sign In button.
  [emailEl, passEl].forEach((el) => {
    if(!el) return;
    el.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); doSignIn(); }
    });
  });
  syncAuthScreenBodyClass();
})();
