/* Bluewater Intel — Stripe billing + entitlement glue
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

(function(){
  // ── Client billing glue (talks to the deployed stripe-checkout / stripe-portal
  //    edge functions). Entitlements are written by the webhook and read back via
  //    refreshEntitlement(); the client never grants access on its own. ──────────
  function sb(){ return window.BW_AUTH && window.BW_AUTH._sb; }
  function fnBase(){
    const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
    return ((cfg.supabaseUrl || cfg.url || "https://mealpzwbjamkjdrsszqe.supabase.co").replace(/\/$/,"")) + "/functions/v1";
  }
  async function authHeaders(){
    const s = sb(); if(!s) throw new Error("Not ready");
    const { data:{ session } } = await s.auth.getSession();
    if(!session) throw new Error("Sign in required.");
    const cfg = window.BW_SUPABASE_CONFIG || {};
    return { "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey || "" };
  }
  function openBillingUrl(url){
    if(window.BW_CAPACITOR && window.BW_CAPACITOR.openExternalUrl) return window.BW_CAPACITOR.openExternalUrl(url);
    window.location.href = url;
  }
  function billingReturnUrl(query){
    const q = String(query || "").replace(/^\?/, "");
    if(window.BW_NATIVE) return "com.bluewaterintel.app://?" + q;
    const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "https://app.bluewaterintel.com";
    return origin + "/?" + q;
  }

  let _purchaseBusy = false;
  let _lastSubscribeAt = 0;
  function setPlanScreenOpen(open){
    try { document.body.classList.toggle("bw-plan-screen-open", !!open); } catch(e){ /* ignore */ }
  }
  function setPurchaseBusy(busy, label){
    _purchaseBusy = !!busy;
    document.querySelectorAll("#plan-gate .bw-buy, #pricing-modal .bw-buy").forEach((btn) => {
      if(busy){
        if(!btn.dataset.bwOrigText) btn.dataset.bwOrigText = btn.textContent;
        btn.disabled = true;
        if(label) btn.textContent = label;
      } else {
        btn.disabled = false;
        if(btn.dataset.bwOrigText){
          btn.textContent = btn.dataset.bwOrigText;
          delete btn.dataset.bwOrigText;
        }
      }
    });
    const restore = document.getElementById("plan-gate-restore-link");
    const restorePricing = document.getElementById("pricing-restore-link");
    [restore, restorePricing].forEach((el) => { if(el) el.style.pointerEvents = busy ? "none" : ""; });
    const freeBtn = document.querySelector('#plan-gate button[onclick*="closePostSignupPlans"]');
    if(freeBtn) freeBtn.disabled = !!busy;
  }
  function showBillingErr(msgEl, text){
    if(!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = "block";
    msgEl.style.color = "#fca5a5";
  }
  function wireIosBillingTapFallback(root){
    if(!root || root._bwBillingTapWired || !window.BW_NATIVE) return;
    root._bwBillingTapWired = true;
    root.addEventListener("touchend", (e) => {
      if(_purchaseBusy) return;
      const t = e.changedTouches && e.changedTouches[0];
      if(!t) return;
      let hit = e.target && e.target.closest && e.target.closest("button, a[href]");
      if(!hit){
        const at = document.elementFromPoint(t.clientX, t.clientY);
        hit = at && at.closest ? at.closest("button, a[href]") : null;
      }
      if(!hit || !root.contains(hit) || hit.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      hit.click();
    }, { passive: false });
  }

  window.bwSubscribe = async function(interval, opts){
    const now = Date.now();
    if(_purchaseBusy || (now - _lastSubscribeAt < 700)) return;
    _lastSubscribeAt = now;
    const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
    if(msg) msg.style.display = "none";
    if(window.BW_NATIVE && window.BW_IAP && window.BW_IAP.available){
      setPurchaseBusy(true, "Opening App Store…");
      try {
        await window.BW_IAP.purchase(interval);
        closePricing();
        if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
        if(typeof showToast === "function") showToast("Pro unlocked — tight lines!", "success");
        if(typeof window.renderNavPlan === "function") window.renderNavPlan();
      } catch(e){
        if(e && (e.userCancelled || /cancel/i.test(String(e.message||"")))) return;
        showBillingErr(msg, e.message || "Purchase could not be completed.");
      } finally {
        setPurchaseBusy(false);
      }
      return;
    }
    const kind = "subscription";
    const intervalKey = interval === "year" ? "year" : "month";
    return window.bwCheckout(kind, { interval: intervalKey, ...(opts||{}) });
  };
  window.openPricing = async function(){
    const m = document.getElementById("pricing-modal"); if(!m) return;
    const msg = document.getElementById("pricing-msg"); if(msg) msg.style.display="none";
    m.style.display = "flex";
    setPlanScreenOpen(true);
    wireIosBillingTapFallback(m);
    wireIosBillingTapFallback(document.getElementById("plan-gate"));
    if(typeof adaptPricingForNative === "function") adaptPricingForNative().catch(() => {});
    if(window.BW_IAP && window.BW_IAP.prewarm) window.BW_IAP.prewarm().catch(() => {});
  };
  window.closePricing = function(){
    const m=document.getElementById("pricing-modal");
    if(m) m.style.display="none";
    const pg = document.getElementById("plan-gate");
    if(!pg || pg.style.display === "none") setPlanScreenOpen(false);
    setPurchaseBusy(false);
  };

  window.markPlanSelected = async function(){
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(u) localStorage.setItem("bwi_plan_selected_" + u.id, new Date().toISOString());
    } catch(e){ /* non-fatal */ }
    try {
      const s = sb();
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!s || !u) return;
      await s.from("profiles").update({ plan_selected_at: new Date().toISOString() }).eq("id", u.id);
    } catch(e){ console.warn("markPlanSelected", e); }
  };
  function planSelectedLocally(uid){
    if(!uid) return false;
    try { return !!localStorage.getItem("bwi_plan_selected_" + uid); } catch(e){ return false; }
  }
  window.needsPlanOnboarding = async function(){
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!u) return false;
      // Already picked Free / Pro once on this device — never re-prompt.
      if(planSelectedLocally(u.id)) return false;
      // Offline (common in Download My Trip / airplane mode): don't block the app
      // waiting on a profile read that can't succeed. They chose a plan when online.
      if(typeof navigator !== "undefined" && navigator.onLine === false) return false;
      const s = sb();
      if(!s) return false;
      const { data:p, error } = await s.from("profiles")
        .select("plan_selected_at, is_owner, subscription_status")
        .maybeSingle();
      if(error) return false;
      if(!p) return true;
      if(p.plan_selected_at){
        try { localStorage.setItem("bwi_plan_selected_" + u.id, p.plan_selected_at); } catch(e){}
        return false;
      }
      if(p.is_owner) return false;
      if(p.subscription_status === "active" || p.subscription_status === "trialing") return false;
      return true;
    } catch(e){ return false; }
  };

  // One-time plan selection after the user's first confirmed sign-in.
  window.openPostSignupPlans = async function(){
    if(typeof navigator !== "undefined" && navigator.onLine === false) return;
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(!u){
      if(typeof window.showAuthGate === "function") window.showAuthGate();
      return;
    }
    if(planSelectedLocally(u.id)) return;
    const g = document.getElementById("plan-gate");
    const m = document.getElementById("plan-gate-msg");
    if(m) m.style.display = "none";
    const auth = document.getElementById("bw-auth-gate");
    const signedIn = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(auth) auth.style.display = signedIn ? "none" : "flex";
    if(g) g.style.display = "flex";
    setPlanScreenOpen(true);
    wireIosBillingTapFallback(g);
    wireIosBillingTapFallback(document.getElementById("pricing-modal"));
    // Show the gate immediately; load StoreKit metadata and pre-warm RevenueCat
    // in the background so a tap never sits on a silent configure() call.
    if(typeof adaptPricingForNative === "function") adaptPricingForNative().catch(() => {});
    if(window.BW_IAP && window.BW_IAP.prewarm) window.BW_IAP.prewarm().catch(() => {});
  };
  // ── Create account page ──────────────────────────────────────────────────
  window.openCreateAccount = function(){
    const p = document.getElementById("create-account-page");
    const m = document.getElementById("ca-msg"); if(m){ m.style.display="none"; m.textContent=""; }
    // Prefill email if they typed it on the sign-in screen
    const em = document.getElementById("bw-auth-email");
    const caEm = document.getElementById("ca-email");
    if(em && caEm && em.value) caEm.value = em.value.trim();
    const auth = document.getElementById("bw-auth-gate");
    if(auth) auth.style.display = "none";
    if(p) p.style.display = "flex";
    if(typeof window.syncAuthScreenBodyClass === "function") window.syncAuthScreenBodyClass();
  };
  window.closeCreateAccount = function(){
    const p = document.getElementById("create-account-page"); if(p) p.style.display = "none";
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(!u && typeof window.showAuthGate === "function") window.showAuthGate();
    else if(typeof window.syncAuthScreenBodyClass === "function") window.syncAuthScreenBodyClass();
  };
  // Dedicated "check your email to verify" screen shown after signup, so the
  // user isn't dropped on the login form before they've confirmed (which caused
  // an "invalid login credentials" error when they tried to sign in early).
  window.showVerifyEmailScreen = function(email){
    const p = document.getElementById("verify-email-page");
    const addr = document.getElementById("verify-email-addr");
    const msg = document.getElementById("verify-email-msg");
    if(addr) addr.textContent = email || "";
    if(msg){ msg.style.display = "none"; msg.textContent = ""; }
    if(p) p._pendingEmail = email || "";
    if(p) p.style.display = "block";
  };
  window.verifyEmailContinue = function(){
    const p = document.getElementById("verify-email-page"); if(p) p.style.display = "none";
    // Take them to the sign-in screen; they'll sign in after confirming.
    if(typeof window.showAuthGate === "function") window.showAuthGate();
  };
  window.resendVerificationEmail = async function(){
    const page = document.getElementById("verify-email-page");
    const msg = document.getElementById("verify-email-msg");
    const btn = document.getElementById("verify-email-resend");
    const email = (page && page._pendingEmail) || (document.getElementById("verify-email-addr")?.textContent || "").trim();
    const show = (text, ok) => {
      if(!msg) return;
      msg.style.display = "block";
      msg.textContent = text;
      msg.style.color = ok ? "#86efac" : "#fca5a5";
    };
    if(!email){ show("Missing email address. Go back and create your account again.", false); return; }
    if(!window.BW_AUTH || !window.BW_AUTH.resendSignupConfirmation){
      show("Sign-in service not ready. Refresh and try again.", false);
      return;
    }
    if(btn){ btn.disabled = true; btn.textContent = "Sending…"; }
    try {
      await window.BW_AUTH.resendSignupConfirmation(email);
      show("Verification email sent — check your inbox and spam folder.", true);
    } catch(e){
      const m = e?.message || String(e);
      if(/rate limit|too many|after \d+ seconds/i.test(m)){
        show("Please wait a minute before requesting another email.", false);
      } else {
        show(m || "Could not resend. Try again in a minute.", false);
      }
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = "Resend verification email"; }
    }
  };
  window.openPasswordRecoveryModal = function(){
    const p = document.getElementById("password-recovery-page");
    const m = document.getElementById("pw-recovery-msg");
    const gate = document.getElementById("bw-auth-gate");
    const newEl = document.getElementById("pw-recovery-new");
    const confirmEl = document.getElementById("pw-recovery-confirm");
    if(m){ m.style.display = "none"; m.textContent = ""; }
    if(newEl) newEl.value = "";
    if(confirmEl) confirmEl.value = "";
    if(gate) gate.style.display = "none";
    if(p) p.style.display = "flex";
  };
  window.closePasswordRecoveryModal = function(){
    const p = document.getElementById("password-recovery-page");
    if(p) p.style.display = "none";
  };
  window.submitPasswordRecovery = async function(){
    const msg = document.getElementById("pw-recovery-msg");
    const show = (text, ok) => {
      if(!msg) return;
      msg.style.display = "block";
      msg.textContent = text;
      msg.style.color = ok ? "#86efac" : "#fca5a5";
    };
    const newPw = (document.getElementById("pw-recovery-new").value || "");
    const confirmPw = (document.getElementById("pw-recovery-confirm").value || "");
    if(!newPw || newPw.length < 6){ show("Password must be at least 6 characters.", false); return; }
    if(newPw !== confirmPw){ show("Passwords do not match.", false); return; }
    if(!window.BW_AUTH || !window.BW_AUTH.updatePassword){
      show("Sign-in service not ready. Refresh the page and try again.", false);
      return;
    }
    try {
      await window.BW_AUTH.updatePassword(newPw);
      window.closePasswordRecoveryModal();
      const gate = document.getElementById("bw-auth-gate");
      if(gate) gate.style.display = "none";
    } catch(e){
      show(e?.message || "Could not update password. Request a new reset link and try again.", false);
    }
  };
  window.submitCreateAccount = async function(){
    const msg = document.getElementById("ca-msg");
    const show = (t) => { if(msg){ msg.style.display="block"; msg.textContent=t; } };
    const name = (document.getElementById("ca-name").value || "").trim();
    const email = (document.getElementById("ca-email").value || "").trim();
    const pass = document.getElementById("ca-password").value || "";
    const agreed = document.getElementById("ca-terms").checked;
    if(!name){ show("Enter your name."); return; }
    if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ show("Enter a valid email address."); return; }
    if(!pass || pass.length < 6){ show("Password must be at least 6 characters."); return; }
    if(!agreed){ show("Please agree to the Terms & Conditions and Privacy Policy to continue."); return; }
    const btn = document.getElementById("ca-submit");
    if(btn){ btn.disabled = true; btn.textContent = "Creating account…"; }
    try {
      // Pass the name + T&C acceptance timestamp as user metadata so the account
      // record captures consent. BW_AUTH.signUp forwards metadata to Supabase.
      const meta = { full_name: name, tos_accepted_at: new Date().toISOString() };
      const res = await window.BW_AUTH.signUp(email, pass, meta);
      closeCreateAccount();
      const hasSession = !!(res && res.session && res.session.user);
      const user = (res && res.user) || (res && res.session && res.session.user);
      const confirmed = window.BW_AUTH.isEmailConfirmed
        ? window.BW_AUTH.isEmailConfirmed(user)
        : !!(user && (user.email_confirmed_at || user.confirmed_at));
      // Email confirmation required — no session yet. Stay on verify screen.
      if(!hasSession || !confirmed){
        if(typeof window.showVerifyEmailScreen === "function"){
          window.showVerifyEmailScreen(email);
        } else if(typeof window.showAuthGate === "function"){
          window.showAuthGate();
          const gmsg = document.getElementById("bw-auth-msg");
          if(gmsg){
            gmsg.style.display = "block";
            gmsg.style.color = "#86efac";
            gmsg.textContent = `Account created! Check your email (${email}) for a verification link, then sign in.`;
          }
        }
        return;
      }
      // Auto-confirmed signup (Confirm email disabled in Supabase) — onSignedIn
      // opens the plan picker; do not also flash the verify-email screen.
    } catch(e){
      show(e && e.message ? e.message : "Could not create account. Try again.");
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = "Create Account"; }
    }
  };

  // ── Account management page ──────────────────────────────────────────────
  window.openAccountPage = function(){
    if(typeof closeNav === "function") closeNav();
    const page = document.getElementById("account-page");
    if(!page) return;
    // Fill profile
    let acct = (typeof USER_PREFS !== "undefined") ? USER_PREFS.account : null;
    if((!acct || !acct.name) && window.BW_AUTH && window.BW_AUTH.getUser){
      const u = window.BW_AUTH.getUser();
      if(u) acct = { name: (u.user_metadata && u.user_metadata.full_name) || (u.email ? u.email.split("@")[0] : "Captain"), email: u.email || "" };
    }
    const name = (acct && acct.name) || "Captain";
    const email = (acct && acct.email) || "";
    const av = document.getElementById("acct-avatar"); if(av) av.textContent = (name[0]||"?").toUpperCase();
    const nm = document.getElementById("acct-name"); if(nm) nm.textContent = name;
    const em = document.getElementById("acct-email"); if(em) em.textContent = email;
    // Fill plan section based on entitlement
    const label = document.getElementById("acct-plan-label");
    const detail = document.getElementById("acct-plan-detail");
    const actions = document.getElementById("acct-plan-actions");
    const paid = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM === true;
    const badgeStyle = "flex:1;text-align:center;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.45);color:#86efac;font-size:12px;font-weight:700;padding:10px 12px;border-radius:8px";
    if(label && detail && actions){
      let planLabel = "Free", planDetail = "You're on the free version — maps, ports, catches, and your own waypoints. Upgrade to Pro to unlock the Bite Map, ocean intel, waypoints, and the AI Captain's Brief.";
      let actionsHtml = `<button class="bw-buy" type="button" style="flex:1;background:#16a34a;border-color:rgba(134,239,172,.55)" onclick="closeAccountPage();openPricing()">Upgrade to Pro</button>`;
      const manageBtn = (p) => {
        const l = bwManageBillingLabel(p);
        return `<button class="bw-buy" type="button" style="flex:1" onclick="bwManageBilling()">${l}</button>`;
      };
      const fillPlan = (p) => {
        const st = p && p.subscription_status;
        const interval = p && p.subscription_interval;
        if(p && p.is_owner){
          planLabel = "Owner";
          planDetail = "Full access · unlimited";
          actionsHtml = `<span style="${badgeStyle}">Owner</span>`;
        } else if(st === "active"){
          planLabel = interval === "year" ? "PRO Annual" : "PRO Monthly";
          planDetail = "Full app — Bite Map, ocean & weather layers, all waypoints, fishing reports, and up to 2 AI Captain's Briefs per day.";
          actionsHtml = `<span style="${badgeStyle}">${planLabel}</span>${manageBtn(p)}`;
        } else if(st === "trialing"){
          planLabel = "7 Day Trial";
          planDetail = "Full app · all waypoints · 1 free AI Captain's Brief for the trial";
          actionsHtml = `<span style="${badgeStyle}">7 Day Trial</span>${manageBtn(p)}`;
        } else if(paid){
          planLabel = "Pro";
          planDetail = "Full app — Bite Map, ocean & weather layers, all waypoints, fishing reports, and up to 2 AI Captain's Briefs per day.";
          actionsHtml = manageBtn(p);
        }
      };
      const paint = (p) => {
        fillPlan(p);
        label.textContent = planLabel;
        detail.textContent = planDetail;
        actions.innerHTML = actionsHtml;
        renderBillingGuidance(p);
      };
      try {
        const s = sb();
        if(s){
          s.from("profiles").select("is_owner, subscription_status, subscription_interval, billing_source").maybeSingle()
            .then(({ data:p }) => paint(p))
            .catch(() => { if(paid) paint(null); });
        } else if(paid){
          fillPlan(null);
        }
      } catch(e){
        if(paid) fillPlan(null);
      }
      label.textContent = planLabel;
      detail.textContent = planDetail;
      actions.innerHTML = actionsHtml;
    }
    const dmsg = document.getElementById("acct-delete-msg"); if(dmsg){ dmsg.style.display="none"; dmsg.textContent=""; }
    page.style.display = "block";
  };
  // Where the subscription was bought decides who can cancel it. Apple's rules
  // (and Stripe's) mean we cannot cancel the other platform's subscription for
  // the user, so the Account page has to name the exact path for their case.
  const APPLE_PATH = "Settings \u2192 [your name] \u2192 Subscriptions \u2192 Bluewater Intel";
  function bwBillingSource(p){
    const st = p && p.subscription_status;
    if(!p || p.is_owner || !(st === "active" || st === "trialing")) return "none";
    if(p.billing_source === "apple") return "apple";
    if(p.billing_source === "stripe") return "stripe";
    return "unknown";
  }
  window.bwManageBillingLabel = function(p){
    const src = bwBillingSource(p);
    if(src === "apple") return "Manage in App Store";
    if(src === "stripe" && window.BW_NATIVE) return "How to cancel";
    return "Manage Billing";
  };
  window.bwOpenAppStoreSubscriptions = function(){
    if(window.BW_IAP && window.BW_IAP.openAppStoreSubscriptions) window.BW_IAP.openAppStoreSubscriptions();
  };
  function renderBillingGuidance(p){
    const help = document.getElementById("acct-billing-help");
    const note = document.getElementById("acct-delete-note");
    const src = bwBillingSource(p);
    if(src === "none"){
      if(help){ help.style.display = "none"; help.innerHTML = ""; }
      if(note){ note.style.display = "none"; note.textContent = ""; }
      return;
    }
    const appleBtn = `<button class="bw-buy" type="button" style="width:100%;margin-top:10px" onclick="bwOpenAppStoreSubscriptions()">Open App Store Subscriptions</button>`;
    let helpHtml = "", noteText = "";
    if(src === "apple"){
      helpHtml = `<b style="color:#f0f6ff">Billed by Apple</b><br>`
        + `You subscribed in the app, so Apple handles payment and cancellation. `
        + `Cancel or switch plans in <b>${APPLE_PATH}</b>. `
        + `Canceling stops future renewals — you keep Pro until the end of the period you already paid for.`
        + appleBtn;
      noteText = `You have a live App Store subscription. Deleting your account does not cancel it — cancel in ${APPLE_PATH} first, or Apple will keep billing your Apple ID.`;
    } else if(src === "stripe" && window.BW_NATIVE){
      helpHtml = `<b style="color:#f0f6ff">Billed on our website</b><br>`
        + `You subscribed at bluewaterintel.com, so this subscription is not managed by the App Store. `
        + `Open <b>app.bluewaterintel.com</b> in Safari, sign in, then use <b>Menu \u2192 Account \u2192 Manage Billing</b> to change your card, switch plans, or cancel.`;
      noteText = `You have a live website subscription. Deleting your account does not cancel it — cancel at app.bluewaterintel.com first, or billing continues.`;
    } else if(src === "stripe"){
      helpHtml = `<b style="color:#f0f6ff">Billed by card (Stripe)</b><br>`
        + `Use <b>Manage Billing</b> above to update your card, switch between monthly and annual, or cancel. `
        + `Canceling stops future charges — you keep Pro through the end of the current period.`;
      noteText = `You have a live subscription. Deleting your account does not cancel it — cancel with Manage Billing first, or billing continues.`;
    } else {
      helpHtml = `<b style="color:#f0f6ff">How to cancel</b><br>`
        + `If you subscribed <b>in the iPhone app</b>, cancel in <b>${APPLE_PATH}</b>. `
        + `If you subscribed <b>on our website</b>, sign in at <b>app.bluewaterintel.com</b> and use <b>Menu \u2192 Account \u2192 Manage Billing</b>. `
        + `Either way you keep Pro until the end of the period you already paid for.`
        + appleBtn;
      noteText = `You have a live subscription. Deleting your account does not cancel it — cancel it first (App Store subscriptions in ${APPLE_PATH}; website subscriptions at app.bluewaterintel.com), or billing continues.`;
    }
    if(help){ help.innerHTML = helpHtml; help.style.display = "block"; }
    if(note){ note.textContent = noteText; note.style.display = "block"; }
  }
  window.closeAccountPage = function(){
    const page = document.getElementById("account-page");
    if(page) page.style.display = "none";
  };
  // Account deletion — two-step confirm, then calls the backend delete endpoint.
  window.deleteAccountFlow = async function(){
    const msg = document.getElementById("acct-delete-msg");
    const show = (t,color) => { if(msg){ msg.style.display="block"; msg.style.color=color||"#cbd5e1"; msg.textContent=t; } };
    const ok = window.confirm("Permanently delete your account and all your data? This cannot be undone.");
    if(!ok) return;
    const typed = window.prompt('This is permanent. Type DELETE to confirm.');
    if(!typed || typed.trim().toUpperCase() !== "DELETE"){ show("Deletion cancelled.", "#9ec5e8"); return; }
    show("Deleting your account…", "#9ec5e8");
    try {
      const res = await fetch(`${fnBase()}/delete-account`, { method:"POST", headers: await authHeaders() });
      if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error || `Delete failed (${res.status})`); }
      // Sign out locally and reload to the signed-out state.
      try { if(window.BW_AUTH && window.BW_AUTH.signOut) await window.BW_AUTH.signOut(); } catch(e){}
      show("Account deleted. Signing you out…", "#86efac");
      setTimeout(()=>{ try { location.reload(); } catch(e){} }, 1200);
    } catch(e){
      show(e.message || `Could not delete account. If you have an active subscription, cancel it first — App Store subscriptions in ${APPLE_PATH}, website subscriptions at app.bluewaterintel.com.`, "#f87171");
    }
  };

  window.closePostSignupPlans = function(){
    const g = document.getElementById("plan-gate"); if(g) g.style.display = "none";
    setPlanScreenOpen(false);
    setPurchaseBusy(false);
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(!u){
      // Never enter the app without a Supabase account — e.g. offline handler
      // closing the plan picker must not bypass the sign-in gate.
      if(typeof window.showAuthGate === "function") window.showAuthGate();
      else {
        const auth = document.getElementById("bw-auth-gate");
        if(auth) auth.style.display = "flex";
      }
      return;
    }
    if(typeof window.hideAuthGate === "function") window.hideAuthGate();
    else {
      const auth = document.getElementById("bw-auth-gate"); if(auth) auth.style.display = "none";
    }
    if(typeof window.markPlanSelected === "function") window.markPlanSelected();
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(u && typeof maybeShowFirstLoginOnboarding === "function") maybeShowFirstLoginOnboarding(u);
    } catch(e){}
  };
  window.bwSignOutFromPlanGate = async function(){
    try { if(window.BW_AUTH && window.BW_AUTH.signOut) await window.BW_AUTH.signOut(); } catch(e){}
    window.closePostSignupPlans();
    // Fall back to a reload so auth state resets cleanly to the sign-in screen.
    try { location.reload(); } catch(e){}
  };
  window.bwCheckout = async function(kind, opts){
    const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
    try {
      const body = {
        kind,
        ...(opts||{}),
        success_url: billingReturnUrl("checkout=success"),
        cancel_url: billingReturnUrl("checkout=cancel"),
      };
      const res = await fetch(`${fnBase()}/stripe-checkout`, { method:"POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || `Checkout failed (${res.status})`);
      if(j.url) openBillingUrl(j.url);
    } catch(e){
      const text = e.message || "Could not start checkout.";
      if(msg){ msg.textContent = text; msg.style.display="block"; msg.style.color = "#fca5a5"; }
      else if(typeof showToast === "function") showToast(text, "error");
    }
  };
  window.bwManageBilling = async function(){
    const msg = document.getElementById("pricing-msg");
    if(window.BW_NATIVE){
      try {
        const s = sb();
        if(s){
          const { data:p } = await s.from("profiles").select("billing_source, subscription_status, is_owner").maybeSingle();
          if(bwBillingSource(p) === "stripe"){
            const note = "This subscription was purchased on our website, so it can't be canceled from the App Store. "
              + "Open app.bluewaterintel.com in Safari, sign in, then use Menu \u2192 Account \u2192 Manage Billing.";
            if(msg){ msg.textContent = note; msg.style.display = "block"; }
            else if(typeof showToast === "function") showToast(note, "info");
            return;
          }
        }
        bwOpenAppStoreSubscriptions();
      } catch(e){
        bwOpenAppStoreSubscriptions();
      }
      return;
    }
    try {
      const body = { return_url: billingReturnUrl("portal=return") };
      const res = await fetch(`${fnBase()}/stripe-portal`, { method:"POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Could not open billing portal.");
      if(j.url) openBillingUrl(j.url);
    } catch(e){ if(msg){ msg.textContent = e.message || "Could not open billing portal."; msg.style.display="block"; } }
  };
  // Renders the plan status + Upgrade/Manage buttons inside the nav account block.
  window.renderNavPlan = async function(){
    const el = document.getElementById("nav-plan"); if(!el) return;
    let tier = "Free", detail = "Maps, ports, catches & your own waypoints";
    let st = "none", interval = null, isOwner = false, profile = null;
    try {
      const s = sb();
      if(s){
        const { data:p } = await s.from("profiles").select("is_owner, subscription_status, subscription_interval, billing_source").maybeSingle();
        profile = p;
        st = (p && p.subscription_status) || "none";
        interval = p && p.subscription_interval;
        isOwner = !!(p && p.is_owner);
        if(isOwner){ tier="Owner"; detail="Full access · unlimited"; }
        else if(st==="active"){ tier="Pro"; detail="Full app · all waypoints · 2 AI briefs/day"; }
        else if(st==="trialing"){ tier="7 Day Trial"; detail="Full app · all waypoints · 1 free AI brief"; }
      }
    } catch(e){ /* show free */ }
    const badgeStyle = "font-family:inherit;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.45);color:#86efac;font-size:11px;font-weight:700;padding:7px 12px;border-radius:7px;white-space:nowrap;text-align:center";
    let actionHtml = `<button type="button" onclick="openPricing()" style="font-family:inherit;background:#2979b5;border:none;color:#fff;font-size:11px;font-weight:700;padding:7px 12px;border-radius:7px;cursor:pointer">Upgrade</button>`;
    if(isOwner){
      actionHtml = `<span style="${badgeStyle}">Owner</span>`;
    } else if(st==="active"){
      const planLabel = interval === "year" ? "PRO Annual" : "PRO Monthly";
      actionHtml = `<span style="${badgeStyle}">${planLabel}</span>`;
    } else if(st==="trialing"){
      actionHtml = `<span style="${badgeStyle}">7 Day Trial</span>`;
    }
    const showManage = !isOwner && (st==="active" || st==="trialing");
    // Kept generic here — the Account page spells out the exact cancel path.
    const manageLabel = bwBillingSource(profile) === "apple" ? "App Store" : "Manage Billing";
    // Entitled accounts lose the Upgrade button, which otherwise makes the plan
    // list unreachable — including for App Review, who sign in already entitled.
    const entitled = isOwner || st==="active" || st==="trialing";
    const viewPlansHtml = entitled
      ? `<button type="button" onclick="openPricing()" style="font-family:inherit;background:transparent;border:1px solid rgba(107,191,234,.35);color:#6bbfea;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer">View plans</button>`
      : "";
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(7,17,33,.5);border:1px solid rgba(107,191,234,.18);border-radius:9px;padding:8px 10px">
        <div style="min-width:0">
          <div style="font-size:11px;color:#9ec5e8">Plan</div>
          <div style="font-size:13px;font-weight:700;color:#f0f6ff">${tier}</div>
          <div style="font-size:10px;color:#7d9bb8;line-height:1.35">${detail}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          ${actionHtml}
          ${showManage?`<button type="button" onclick="bwManageBilling()" style="font-family:inherit;background:transparent;border:1px solid rgba(107,191,234,.35);color:#6bbfea;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer">${manageLabel}</button>`:""}
          ${viewPlansHtml}
        </div>
      </div>`;
  };
  // If returning from a successful Stripe checkout, refresh entitlement shortly
  // after load (webhook may take a second) and clean the URL.
  window._bwSetPurchaseBusy = setPurchaseBusy;
  window._bwIsPurchaseBusy = () => _purchaseBusy;
  try {
    const q = new URLSearchParams(location.search);
    if(q.get("checkout")==="success"){
      const clean = location.origin + location.pathname;
      history.replaceState({}, "", clean);
      if(typeof window.markPlanSelected === "function") window.markPlanSelected();
      // After returning from Stripe, the webhook that writes entitlement can lag
      // a few seconds. Re-check entitlement a few times; as soon as the plan is
      // active, drop the plan gate AND the auth gate so the user enters the app.
      const bump = async (n)=>{
        try { if(typeof refreshEntitlement==="function") await refreshEntitlement(); } catch(e){}
        if(typeof renderNavPlan==="function") renderNavPlan();
        const entitled = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM === true;
        if(entitled){
          if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
          else if(window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser() && typeof window.hideAuthGate === "function"){
            window.hideAuthGate();
          }
        } else if(n>0){
          setTimeout(()=>bump(n-1), 2500);
        }
      };
      setTimeout(()=>bump(4), 1500);
    }
  } catch(e){}
})();

// iOS/Android: swap Stripe checkout copy for App Store billing on native builds.
window.BW_LEGAL_URLS = {
  terms: "https://app.bluewaterintel.com/terms.html",
  privacy: "https://app.bluewaterintel.com/privacy.html",
  support: "https://app.bluewaterintel.com/support.html",
  appleEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
};

window.bwOpenLegalUrl = function(url){
  if(window.BW_CAPACITOR && window.BW_CAPACITOR.openExternalUrl) return window.BW_CAPACITOR.openExternalUrl(url);
  window.open(url, "_blank", "noopener");
};

function bwLegalLinksHtml(){
  const u = window.BW_LEGAL_URLS || {};
  const link = (href, label) =>
    `<a href="#" onclick="event.preventDefault();bwOpenLegalUrl('${href}')" style="color:#7dd3fc;text-decoration:underline">${label}</a>`;
  return `${link(u.terms, "Terms of Use")} · ${link(u.privacy, "Privacy Policy")} · ${link(u.appleEula, "Apple EULA")}`;
}

function bwAutoRenewDisclosure(){
  return "Payment is charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. Manage and cancel in Settings → [your name] → Subscriptions.";
}

function bwPriceString(p){
  if(!p) return null;
  return p.priceString || p.localizedPriceString || p.price_string || null;
}

// A free trial on iOS is an App Store *introductory offer* with a zero price.
// Returns {label, period, duration} when the monthly product carries one, else
// null. `duration` is null when StoreKit does not report a usable period.
function bwIntroTrial(product){
  const intro = product && (product.introPrice || product.intro_price);
  if(!intro) return null;
  const price = Number(intro.price);
  if(!Number.isFinite(price) || price > 0) return null;
  const n = Number(intro.periodNumberOfUnits ?? intro.period_number_of_units) || 0;
  const unit = String(intro.periodUnit || intro.period_unit || "").toLowerCase().replace(/s$/, "");
  if(!n || !unit) return { label: "Free trial", period: "free trial", duration: null };
  const duration = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return { label: `${n}-${unit} free trial`, period: `${duration} free`, duration };
}

// Guideline 3.1.2(c): the billed amount must be at least as clear and
// conspicuous as the free trial. The headline (.bw-native-trial-terms) always
// carries BOTH the trial length and the price that follows it, in the same line
// at the same size/weight, and the CTA repeats the post-trial price.
function applyNativeTrialBlock(products){
  const blocks = document.querySelectorAll(".bw-native-trial-block");
  if(!blocks.length) return;
  const monthly = products && products.monthly;
  const trial = bwIntroTrial(monthly);
  const eligibility = (products && products.monthlyTrial) || "unknown";
  const price = bwPriceString(monthly);
  const perMonth = price ? `${price}/month` : "the monthly price";
  const SUB_NAME = "Bluewater Intel Pro — auto-renewing subscription";
  // Only promise a free trial when Apple says this Apple ID can still use the
  // introductory offer. Otherwise the purchase sheet charges immediately and the
  // "no charge today" copy would be a lie.
  if(!trial || eligibility === "none"){
    blocks.forEach(el => { el.style.display = "none"; });
    return;
  }
  const dur = trial.duration;
  if(eligibility === "ineligible" || eligibility === "unknown"){
    blocks.forEach(el => {
      const title = el.querySelector(".bw-native-trial-title");
      const terms = el.querySelector(".bw-native-trial-terms");
      const desc = el.querySelector(".bw-native-trial-desc");
      const btn = el.querySelector(".bw-native-trial-btn");
      el.style.background = "rgba(107,191,234,.08)";
      el.style.borderColor = "rgba(107,191,234,.3)";
      if(title){ title.style.color = "#9ec5e8"; title.textContent = SUB_NAME; }
      if(terms) terms.textContent = `${perMonth}, billed today`;
      if(desc){
        desc.textContent = eligibility === "ineligible"
          ? `The ${dur ? dur + " " : ""}free trial has already been used by the Apple ID signed in on this device, so a new subscription is billed ${perMonth} today and renews automatically each month until you cancel. Choose Monthly or Annual below.`
          : `We couldn't confirm free-trial eligibility for the Apple ID on this device. If the trial does not apply, you are billed ${perMonth} today and the subscription renews automatically each month until you cancel. Apple shows the exact terms on the confirmation screen before you are charged.`;
      }
      if(btn) btn.style.display = "none";
      el.style.display = "";
    });
    return;
  }
  blocks.forEach(el => {
    const title = el.querySelector(".bw-native-trial-title");
    const terms = el.querySelector(".bw-native-trial-terms");
    const desc = el.querySelector(".bw-native-trial-desc");
    const btn = el.querySelector(".bw-native-trial-btn");
    if(title) title.textContent = SUB_NAME;
    if(terms) terms.textContent = dur ? `${dur} free, then ${perMonth}` : `Free trial, then ${perMonth}`;
    if(desc){
      desc.textContent = `Full app — the Bite Map, ocean and wind layers, forecasts and all charted waypoints for your home port. `
        + `After the ${dur ? dur + " " : ""}free trial ends, Bluewater Intel Pro renews automatically at ${perMonth} until you cancel. `
        + `Cancel at least 24 hours before the trial ends in Settings → [your name] → Subscriptions.`;
    }
    if(btn){
      btn.style.display = "";
      btn.textContent = dur
        ? `Start ${dur} free trial — then ${perMonth}`
        : `Start free trial — then ${perMonth}`;
    }
    el.style.display = "";
  });
}

function applyNativeProductLabels(products){
  const fmt = (p, fallback) => {
    if(!p) return fallback;
    const price = bwPriceString(p);
    const period = (p.subscriptionPeriod || p.subscription_period || "").toLowerCase();
    if(price && /year|annual|12/.test(period)) return `${price}/year`;
    if(price && /month/.test(period)) return `${price}/month`;
    return price ? price : fallback;
  };
  const monthlyBtn = document.getElementById("pricing-monthly-btn");
  const annualBtn = document.getElementById("pricing-annual-btn");
  const planMonthlyBtn = document.getElementById("plan-gate-monthly-btn");
  const planAnnualBtn = document.getElementById("plan-gate-annual-btn");
  const mLabel = fmt(products && products.monthly, "Monthly");
  const yLabel = fmt(products && products.annual, "Annual");
  if(monthlyBtn) monthlyBtn.textContent = `Bluewater Intel Pro — 1 month · ${mLabel}`;
  if(annualBtn) annualBtn.textContent = `Bluewater Intel Pro — 1 year · ${yLabel}`;
  if(planMonthlyBtn) planMonthlyBtn.textContent = `Bluewater Intel Pro — 1 month · ${mLabel}`;
  if(planAnnualBtn) planAnnualBtn.textContent = `Bluewater Intel Pro — 1 year · ${yLabel}`;
}

window.bwRestorePurchases = async function(){
  const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
  const show = (t, ok) => {
    if(!msg) return;
    msg.textContent = t;
    msg.style.display = "block";
    msg.style.color = ok ? "#86efac" : "#fca5a5";
  };
  if(window._bwIsPurchaseBusy && window._bwIsPurchaseBusy()) return;
  if(!window.BW_IAP || !window.BW_IAP.restore){
    show("Restore is only available in the iOS app.", false);
    return;
  }
  if(window._bwSetPurchaseBusy) window._bwSetPurchaseBusy(true, "Restoring…");
  try {
    await window.BW_IAP.restore();
    if(window.BW_PREMIUM){
      show("Purchases restored — Pro is active.", true);
      closePricing();
      if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
    } else {
      show("No active App Store subscription found for this account.", false);
    }
  } catch(e){
    show(e.message || "Could not restore purchases.", false);
  } finally {
    if(window._bwSetPurchaseBusy) window._bwSetPurchaseBusy(false);
  }
};

window.adaptPricingForNative = async function(){
  if(!window.BW_NATIVE) return;
  const trialBlocks = document.querySelectorAll(".bw-stripe-trial-block");
  trialBlocks.forEach(el => { el.style.display = "none"; });
  const stripeLinks = document.querySelectorAll(".bw-stripe-only");
  stripeLinks.forEach(el => { el.style.display = "none"; });

  const note = document.getElementById("pricing-checkout-note");
  if(note){
    note.innerHTML = `<div style="margin-bottom:8px">${bwAutoRenewDisclosure()}</div>`
      + `<div>${bwLegalLinksHtml()}</div>`;
  }
  const planNote = document.getElementById("plan-gate-checkout-note");
  if(planNote){
    planNote.innerHTML = `<div style="margin-bottom:8px">${bwAutoRenewDisclosure()}</div>`
      + `<div>${bwLegalLinksHtml()}</div>`;
  }
  // The tutorial copy describes Stripe checkout, which does not apply in the
  // native app — App Store purchases are billed and canceled through Apple.
  const tutSub = document.getElementById("tut-subscription-desc");
  if(tutSub){
    tutSub.innerHTML = `Bluewater Intel offers a free tier plus a paid <b>Subscription</b> that unlocks the full app — the Bite Map, `
      + `ocean &amp; wind layers, forecasts, and more. Pick <b>monthly</b> or a discounted <b>annual</b> plan. `
      + `Purchases in this app are handled by the <b>App Store</b> and billed to your Apple ID — we never see your card. `
      + `If a free trial is available to your Apple ID, Apple shows the exact terms on the confirmation screen before you're charged. `
      + `To cancel or switch plans, go to <b>Settings → [your name] → Subscriptions → Bluewater Intel</b> `
      + `(also reachable from <b>Menu → Manage Account</b>). Subscriptions auto-renew until canceled; `
      + `see <b>Menu → Legal &amp; Privacy</b> for full terms.`;
  }
  const manage = document.getElementById("pricing-manage-link");
  if(manage){
    manage.textContent = "Manage subscription in App Store settings";
    manage.onclick = (e) => {
      e.preventDefault();
      if(window.BW_IAP && window.BW_IAP.openAppStoreSubscriptions) window.BW_IAP.openAppStoreSubscriptions();
    };
  }

  if(window.BW_IAP && window.BW_IAP.loadProducts){
    try {
      const products = await window.BW_IAP.loadProducts();
      if(products && !products.error){
        applyNativeProductLabels(products);
        applyNativeTrialBlock(products);
      }
    } catch(e){ /* fall back to static button labels, no trial block */ }
  }
};
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => { if(typeof adaptPricingForNative === "function") adaptPricingForNative(); });
} else if(typeof adaptPricingForNative === "function"){
  adaptPricingForNative();
}
