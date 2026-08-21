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
  function hideGate(){ if(gate) gate.style.display="none"; clearAuthKbOpen(gate); authKeyboardScroll(false); }
  function showGate(){
    if(gate) gate.style.display="flex";
    if(window.BW_NATIVE) authKeyboardScroll(true);
  }
  // Other modules (billing offline handler, plan picker) must not hide the gate
  // unless a real Supabase session exists.
  window.showAuthGate = showGate;
  window.hideAuthGate = hideGate;
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
  let _authKbScrollOn = false;
  let _kbListenerBound = false;
  async function authKeyboardScroll(on){
    const K = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(!K || typeof K.setScroll !== "function") return;
    if(_authKbScrollOn === on) return;
    _authKbScrollOn = on;
    try { await K.setScroll({ isDisabled: !on }); } catch(e){ /* non-fatal */ }
  }
  function authScreensOpen(){
    const ca = document.getElementById("create-account-page");
    const pw = document.getElementById("password-recovery-page");
    return (gate && gate.style.display !== "none")
      || (ca && ca.style.display !== "none")
      || (pw && pw.style.display !== "none");
  }
  function clearAuthKbOpen(root){
    if(root) root.classList.remove("auth-kb-open");
  }
  function applyAuthKbHeight(h){
    const px = Math.max(0, Number(h) || 0);
    document.querySelectorAll(".auth-fullscreen").forEach((root) => {
      if(root.style.display === "none") return;
      root.style.setProperty("--auth-kb-pad", px > 50 ? (px + 40) + "px" : "0px");
    });
  }
  function syncAuthKbPad(root){
    const vv = window.visualViewport;
    if(!vv || !root) return;
    const kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
    applyAuthKbHeight(kb);
  }
  function scrollAuthFieldIntoView(el){
    if(!el) return;
    const root = el.closest(".auth-fullscreen");
    if(!root) return;
    root.classList.add("auth-kb-open");
    authKeyboardScroll(true);
    syncAuthKbPad(root);
    const doScroll = () => {
      try {
        // Scroll the auth overlay itself — WebView scroll is often disabled.
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const pad = 24;
        const overflow = elRect.bottom + pad - rootRect.bottom;
        if(overflow > 0) root.scrollTop += overflow;
        // Ensure bottom actions (Forgot / Create account) stay reachable on password focus.
        const tail = root.querySelector("#bw-auth-signup, #ca-submit, #pw-submit");
        if(tail && el.matches("#bw-auth-password, #ca-password, #pw-email")){
          const tailRect = tail.getBoundingClientRect();
          const tailOverflow = tailRect.bottom + pad - rootRect.bottom;
          if(tailOverflow > 0) root.scrollTop += tailOverflow;
        }
      } catch(e){
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); }
        catch(e2){ el.scrollIntoView(true); }
      }
    };
    setTimeout(doScroll, 80);
    setTimeout(doScroll, 320);
  }
  function bindKeyboardHeightListeners(){
    if(_kbListenerBound) return;
    const K = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(!K || !K.addListener) return;
    _kbListenerBound = true;
    K.addListener("keyboardWillShow", (info) => {
      applyAuthKbHeight(info && info.keyboardHeight);
      const active = document.activeElement;
      if(active && active.matches && active.matches("input,textarea,select")){
        scrollAuthFieldIntoView(active);
      }
    }).catch(() => {});
    K.addListener("keyboardWillHide", () => {
      applyAuthKbHeight(0);
      document.querySelectorAll(".auth-fullscreen.auth-kb-open").forEach(clearAuthKbOpen);
      if(!authScreensOpen()) authKeyboardScroll(false);
    }).catch(() => {});
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
            clearAuthKbOpen(root);
            root.style.setProperty("--auth-kb-pad", "0px");
            if(!authScreensOpen()) authKeyboardScroll(false);
          }
        }, 120);
      });
    });
  }
  bindKeyboardHeightListeners();
  wireAuthFormScroll(gate);
  wireAuthFormScroll(document.getElementById("create-account-page"));
  wireAuthFormScroll(document.getElementById("password-recovery-page"));

  function hideBootChrome(){
    if(typeof window.BW_hideNativeSplash === "function"){
      window.BW_hideNativeSplash().catch(() => {});
    }
  }

  async function onSignedIn(user, event){
    if(!user || !user.id || !sessionStill(user)){ enforceAuthGate(); return; }
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

  async function doSignIn(){
    msg.style.display="none";
    const c = validCreds(); if(!c) return;
    try {
      await window.BW_AUTH.signIn(c.email, c.password);
    } catch(e){ showErr(e.message || "Sign in failed"); }
  }
  document.getElementById("bw-auth-signin").addEventListener("click", doSignIn);
  // Let the user submit with Enter from either the email or password field,
  // instead of forcing a click on the Sign In button.
  [emailEl, passEl].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); doSignIn(); }
    });
  });
  forgotEl.addEventListener("click", async (e) => {
    e.preventDefault();
    msg.style.display="none";
    const em = emailEl.value.trim();
    if(!em) return showErr("Enter your email above first, then tap Forgot password.");
    try {
      await window.BW_AUTH.resetPassword(em);
      showResetSentBanner();
    } catch(err){ showErr(err?.message || "Could not send reset email."); }
  });
  document.getElementById("bw-auth-signup").addEventListener("click", () => {
    if(typeof window.openCreateAccount === "function") window.openCreateAccount();
  });
})();
