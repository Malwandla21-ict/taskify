/* ── In-app offers ("Make an offer") — shared by task-details and
   sale-details. DEMO payments only: nothing here moves real money.

   Backend: /api/offers (services/offer.service.js). The server checks
   every rule (allowed amounts, whose turn it is, counter limit, expiry);
   the limits shown here come from the API, never hard-coded.

   Usage (after the details page has rendered):
     initOffers({
       contextType: "task" | "sales_item",
       contextId, listing, isOwner,
       sectionEl,        // where the Offers panel goes
       makeOfferButton,  // optional "Make an offer" button
       onListingChanged  // called after an accept (the listing changed)
     });
*/
(function () {
  const WORDS = {
    task:       { noun: "task", owner: "poster", offerer: "student" },
    sales_item: { noun: "item", owner: "seller", offerer: "buyer" }
  };

  let state = null;

  const esc = escapeHtml;

  function timeLeft(seconds) {
    if (seconds == null) return "";
    if (seconds < 60) return "less than a minute left";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min left`;
    return `${Math.floor(seconds / 3600)}h left`;
  }

  /* Modals are added once per page and reused. */
  function ensureModals() {
    if (document.getElementById("offerModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="offerModal" role="dialog" aria-modal="true" aria-labelledby="offerModalTitle">
        <h2><i class="ti ti-tag" aria-hidden="true"></i> <span id="offerModalTitle">Make an offer</span></h2>
        <div id="offerModalIntro"></div>
        <form id="offerForm" novalidate>
          <div class="form-group">
            <label for="offerAmountInput" id="offerAmountLabel">Your offer (R)</label>
            <input type="number" id="offerAmountInput" inputmode="decimal" step="0.01" required />
            <small class="offer-field-hint" id="offerAmountHint"></small>
          </div>
          <div id="offerPreview"></div>
          <div class="form-group">
            <label for="offerMessageInput">Note <span class="offer-optional">(optional)</span></label>
            <textarea id="offerMessageInput" rows="3" style="min-height:76px;"></textarea>
            <small class="offer-field-hint"><span id="offerMessageCount">0</span>/<span id="offerMessageMax">300</span> · phone numbers and emails are hidden</small>
          </div>
          <p class="pay-note blocked" id="offerFormError" hidden></p>
          <div class="form-row">
            <button type="button" id="closeOfferModal" class="secondary-button">
              <i class="ti ti-x" aria-hidden="true"></i> Cancel
            </button>
            <button type="submit" id="submitOfferButton" class="primary-button">
              <i class="ti ti-send" aria-hidden="true"></i> <span>Send offer</span>
            </button>
          </div>
        </form>
      </div>
      <div id="offerConfirmModal" role="dialog" aria-modal="true" aria-labelledby="offerConfirmTitle">
        <h2><i class="ti ti-shield-check" aria-hidden="true"></i> <span id="offerConfirmTitle">Accept offer</span></h2>
        <div id="offerConfirmBody"></div>
        <div class="form-row">
          <button type="button" id="closeOfferConfirm" class="secondary-button">
            <i class="ti ti-x" aria-hidden="true"></i> Cancel
          </button>
          <button type="button" id="offerConfirmButton" class="primary-button">
            <i class="ti ti-check" aria-hidden="true"></i> <span>Confirm</span>
          </button>
        </div>
      </div>`);

    const offerModal = document.getElementById("offerModal");
    const confirmModal = document.getElementById("offerConfirmModal");
    document.getElementById("closeOfferModal").addEventListener("click", () => closeModal(offerModal));
    document.getElementById("closeOfferConfirm").addEventListener("click", () => closeModal(confirmModal));
    document.getElementById("overlay")?.addEventListener("click", () => {
      closeModal(offerModal);
      closeModal(confirmModal);
    });
    document.getElementById("offerMessageInput").addEventListener("input", (e) => {
      document.getElementById("offerMessageCount").textContent = e.target.value.length;
    });
  }

  /* ── Rendering ── */

  function amountTrail(offer) {
    const steps = offer.history.length ? offer.history : [{ amount: offer.amount, proposed_by: offer.last_proposed_by }];
    return steps.map((step, i) => {
      const mine = step.proposed_by === offer.my_role;
      const current = i === steps.length - 1;
      return `${i ? `<i class="ti ti-arrow-right offer-trail-arrow" aria-hidden="true"></i>` : ""}
        <span class="offer-chip${current ? " current" : ""}${mine ? " mine" : ""}" title="Proposed by ${mine ? "you" : "them"}">
          ${formatRand(step.amount)}<small>${mine ? "you" : "them"}</small>
        </span>`;
    }).join("");
  }

  function latestNote(offer) {
    const withNote = [...offer.history].reverse().find(h => h.message);
    if (!withNote) return "";
    const who = withNote.proposed_by === offer.my_role ? "You" : "They";
    return `<p class="offer-note"><i class="ti ti-message-2" aria-hidden="true"></i> <span><strong>${who}:</strong> ${esc(withNote.message)}</span></p>`;
  }

  function metaLine(offer) {
    if (offer.status !== "Pending") return "";
    const words = WORDS[offer.context_type];
    const waiting = offer.waiting_for === offer.my_role
      ? `<strong>Your turn</strong>`
      : `Waiting for the ${offer.waiting_for === "owner" ? words.owner : words.offerer}`;
    const counters = offer.rounds_left === 0 ? "no counters left" : `${offer.rounds_left} counter${offer.rounds_left === 1 ? "" : "s"} left`;
    return `<p class="offer-meta">${waiting} · ${timeLeft(offer.expires_in_seconds)} · ${counters}</p>`;
  }

  /* On a task, an untouched offer at the listed price is an application
     ("Apply for this task") — the poster chooses who does each task. */
  function isApplication(offer) {
    const listed = Number(state.data?.rules?.listed_price);
    return offer.context_type === "task" && offer.history.length <= 1 && Math.abs(Number(offer.amount) - listed) < 0.005;
  }

  function offerCard(offer) {
    const isOwnerView = offer.my_role === "owner";
    const application = isApplication(offer);
    const who = isOwnerView ? offer.offerer.name : (application ? "Your application" : "Your offer");
    const acceptLabel = application && isOwnerView ? `Choose ${esc(offer.offerer.name.split(" ")[0])}` : `Accept ${formatRand(offer.amount)}`;
    const actions = [
      offer.can_accept && `<button type="button" class="primary-button offer-btn" data-offer-action="accept" data-offer-id="${offer.id}">
          <i class="ti ti-check" aria-hidden="true"></i> ${acceptLabel}</button>`,
      offer.can_counter && `<button type="button" class="secondary-button offer-btn" data-offer-action="counter" data-offer-id="${offer.id}">
          <i class="ti ti-arrows-exchange" aria-hidden="true"></i> Counter</button>`,
      offer.can_decline && `<button type="button" class="secondary-button offer-btn danger" data-offer-action="decline" data-offer-id="${offer.id}">
          <i class="ti ti-x" aria-hidden="true"></i> Decline</button>`,
      offer.can_withdraw && `<button type="button" class="secondary-button offer-btn danger" data-offer-action="withdraw" data-offer-id="${offer.id}">
          <i class="ti ti-arrow-back-up" aria-hidden="true"></i> Withdraw</button>`
    ].filter(Boolean).join("");

    return `
      <article class="offer-card${offer.status === "Pending" ? " open" : ""}${offer.can_accept ? " your-turn" : ""}">
        <header class="offer-card-head">
          ${isOwnerView ? `<div class="market-avatar offer-avatar">${avatarHtml(offer.offerer.name, offer.offerer.photo)}</div>` : ""}
          <div class="offer-card-who">
            <strong>${esc(who)}</strong>
            <span>${new Date(offer.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}${application ? " · applied at the listed price" : ""}</span>
          </div>
          ${application ? `<span class="badge blue">Application</span>` : ""}
          ${statusBadge(offer.status)}
        </header>
        <div class="offer-trail" aria-label="Amounts proposed so far">${amountTrail(offer)}</div>
        ${latestNote(offer)}
        ${metaLine(offer)}
        ${actions ? `<div class="offer-actions">${actions}</div>` : ""}
      </article>`;
  }

  function renderSection() {
    const { sectionEl, data, isOwner, contextType } = state;
    if (!sectionEl) return;
    const words = WORDS[contextType];
    const offers = data?.offers || [];
    const rules = data?.rules;

    if (!isOwner && !offers.length) { sectionEl.innerHTML = ""; return; }

    const waitingOnMe = offers.filter(o => o.can_accept).length;
    const isTask = contextType === "task";
    const intro = isOwner
      ? (offers.length
          ? (isTask
              ? `Students apply at your price or offer a different one (${formatRand(rules.min_amount)} to ${formatRand(rules.max_amount)}). Choosing someone assigns the task to them at that price and holds your payment (demo); everyone else is told it's taken.`
              : `Offers can be between ${formatRand(rules.min_amount)} and ${formatRand(rules.max_amount)}. Accepting reserves the item and holds the buyer's payment (demo).`)
          : (isTask
              ? `No applicants yet. Students apply at your price, or offer between ${formatRand(rules.min_amount)} and ${formatRand(rules.max_amount)}. You choose who does it.`
              : `No offers yet. Students can offer between ${formatRand(rules.min_amount)} and ${formatRand(rules.max_amount)}.`))
      : `Only you and the ${words.owner} can see this.`;
    const myApplication = !isOwner && offers.some(isApplication);
    const heading = isOwner ? (isTask ? "Applicants &amp; offers" : "Offers") : (myApplication ? "Your application" : "Your offer");

    sectionEl.innerHTML = `
      <section class="offers-panel" aria-labelledby="offersPanelTitle">
        <div class="offers-panel-head">
          <h3 id="offersPanelTitle"><i class="ti ti-${isTask && isOwner ? "users" : "tag"}" aria-hidden="true"></i> ${heading}</h3>
          ${waitingOnMe ? `<span class="badge gold">${waitingOnMe} waiting for you</span>` : ""}
          <span class="badge gold offers-demo-chip">Demo</span>
        </div>
        <p class="pay-note">${intro}</p>
        <div class="offers-list">${offers.map(offerCard).join("")}</div>
      </section>`;

    sectionEl.querySelectorAll("[data-offer-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const offer = offers.find(o => String(o.id) === btn.dataset.offerId);
        if (!offer) return;
        const action = btn.dataset.offerAction;
        if (action === "accept") openAcceptConfirm(offer);
        else if (action === "counter") openOfferForm({ mode: "counter", offer });
        else closeOfferAction(offer, action, btn);
      });
    });
  }

  function refreshMakeOfferButton() {
    const rules = state.data?.rules;
    const myOpen = state.data?.offers?.find(o => o.status === "Pending" && o.my_role === "offerer");

    /* "Apply for this task" — hidden once you have an open application or
       offer (the panel shows it instead), or when you can't apply. */
    const applyBtn = state.applyButton;
    if (applyBtn) applyBtn.hidden = !!myOpen || (rules && !rules.can_make_offer);

    const btn = state.makeOfferButton;
    if (!btn) return;
    btn.hidden = false;
    btn.disabled = false;
    if (myOpen) {
      btn.innerHTML = myOpen.can_accept
        ? `<i class="ti ti-arrows-exchange" aria-hidden="true"></i> Reply to counter-offer`
        : `<i class="ti ti-tag" aria-hidden="true"></i> ${isApplication(myOpen) ? "View your application" : "View your offer"}`;
    } else if (rules && !rules.can_make_offer) {
      btn.hidden = true;
    } else {
      btn.innerHTML = state.applyButton
        ? `<i class="ti ti-tag" aria-hidden="true"></i> Offer a different price`
        : `<i class="ti ti-tag" aria-hidden="true"></i> Make an offer`;
    }
  }

  /* ── Make an offer / counter ── */

  function paymentPreview(amount) {
    const rules = state.data?.rules;
    if (state.contextType !== "sales_item" || !rules || !(amount > 0)) return "";
    const fee = Math.round(amount * rules.protection_fee_percent) / 100;
    return `<div class="money-breakdown">
        ${moneyRow("Item price", amount)}
        ${moneyRow(`Protection fee (${rules.protection_fee_percent}%)`, fee)}
        ${moneyRow("Held if accepted", amount + fee, { strong: true })}
      </div>`;
  }

  function openOfferForm({ mode, offer = null }) {
    ensureModals();
    const rules = state.data.rules;
    const words = WORDS[state.contextType];
    const role = offer ? offer.my_role : "offerer";
    const buyerPays = state.contextType === "sales_item" && role === "offerer";

    const consequence = state.contextType === "task"
      ? (role === "owner"
          ? `If they accept, the task is assigned at this price and your payment is held by Taskify.`
          : `If the poster accepts, the task is yours at this price and their payment is held by Taskify.`)
      : (role === "owner"
          ? `If the buyer accepts, the item is reserved for them and their payment is held by Taskify.`
          : `If the seller accepts, your payment (plus the ${rules.protection_fee_percent}% protection fee) is held by Taskify straight away and you get a handover code.`);

    /* "apply" = an offer at exactly the listed price (tasks only): the
       amount is fixed, the student just adds an optional note. */
    const applying = mode === "apply";
    document.getElementById("offerModalTitle").textContent =
      applying ? "Apply for this task" : mode === "counter" ? "Counter-offer" : "Make an offer";
    document.getElementById("offerAmountLabel").textContent = mode === "counter" ? "Your counter-offer (R)" : "Your offer (R)";
    document.getElementById("offerModalIntro").innerHTML = applying
      ? `<p class="pay-note">You're applying to do this task at the listed price of <strong>${formatRand(rules.listed_price)}</strong>. The poster chooses who does it from everyone who applies. If they choose you, the task is yours and their payment is held by Taskify (demo). Want a different price? Cancel and use <strong>Offer a different price</strong> instead.</p>`
      : `
      ${demoPaymentBanner("No real money moves — agreeing a price here simulates the payment being held.")}
      <p class="pay-note">${mode === "counter"
        ? `They proposed <strong>${formatRand(offer.amount)}</strong>. ${offer.rounds_left === 1 ? "This is the last counter-offer allowed." : `${offer.rounds_left} counter-offers left.`}`
        : `Listed at <strong>${formatRand(rules.listed_price)}</strong>.`} ${consequence}</p>`;

    const amountInput = document.getElementById("offerAmountInput");
    amountInput.closest(".form-group").hidden = applying;
    amountInput.value = applying ? rules.listed_price : "";
    amountInput.min = rules.min_amount;
    amountInput.max = rules.max_amount;
    document.getElementById("offerAmountHint").textContent =
      `Between ${formatRand(rules.min_amount)} and ${formatRand(rules.max_amount)} · expires after ${rules.expiry_hours}h without a reply`;
    const messageInput = document.getElementById("offerMessageInput");
    messageInput.value = "";
    messageInput.maxLength = rules.message_max_length;
    document.getElementById("offerMessageMax").textContent = rules.message_max_length;
    document.getElementById("offerMessageCount").textContent = "0";
    const errorEl = document.getElementById("offerFormError");
    errorEl.hidden = true;

    const preview = document.getElementById("offerPreview");
    preview.innerHTML = "";
    amountInput.oninput = () => { preview.innerHTML = buyerPays ? paymentPreview(Number(amountInput.value)) : ""; };

    const submit = document.getElementById("submitOfferButton");
    submit.querySelector("span").textContent = applying ? "Send application" : mode === "counter" ? "Send counter" : "Send offer";
    if (applying) document.getElementById("offerMessageInput").placeholder = "Optional: why you're a good fit, or when you can do it";

    document.getElementById("offerForm").onsubmit = async (e) => {
      e.preventDefault();
      const amount = Number(amountInput.value);
      if (!(amount >= rules.min_amount && amount <= rules.max_amount)) {
        errorEl.textContent = `Enter an amount between ${formatRand(rules.min_amount)} and ${formatRand(rules.max_amount)}.`;
        errorEl.hidden = false;
        amountInput.focus();
        return;
      }
      if (mode === "counter" && Math.abs(amount - offer.amount) < 0.005) {
        errorEl.textContent = "That's the amount they already proposed — accept it instead.";
        errorEl.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        const message = messageInput.value.trim() || undefined;
        if (mode === "counter") {
          await apiRequest(`/offers/${offer.id}/counter`, "POST", { amount, message });
          showToast("Counter-offer sent.");
        } else {
          await apiRequest("/offers", "POST", { contextType: state.contextType, contextId: Number(state.contextId), amount, message });
          showToast(applying ? "Application sent. The poster will choose who does it." : `Offer sent to the ${words.owner}.`);
        }
        closeModal(document.getElementById("offerModal"));
        await loadOffers();
        state.sectionEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        await loadOffers();
      } finally {
        submit.disabled = false;
      }
    };

    openModal(document.getElementById("offerModal"));
    setTimeout(() => (applying ? messageInput : amountInput).focus(), 50);
  }

  /* ── Accept (shows what money is held before it happens) ── */

  function openAcceptConfirm(offer) {
    ensureModals();
    const words = WORDS[offer.context_type];
    const isTask = offer.context_type === "task";
    const role = offer.my_role;
    const preview = offer.payment_preview;
    let title, body, buttonText, heldMessage;

    if (isTask && role === "owner") {
      title = isApplication(offer) ? `Choose ${offer.offerer.name}?` : "Accept & hold payment";
      buttonText = isApplication(offer) ? "Choose & pay" : "Accept & pay";
      heldMessage = isApplication(offer)
        ? `${offer.offerer.name} is doing your task. ${formatRand(offer.amount)} is held until you confirm the work is done.`
        : `Offer accepted. ${formatRand(offer.amount)} is held until you confirm the work is done.`;
      body = `${demoPaymentBanner("No real payment gateway is connected. This simulates your payment being held in escrow until the task is done and you confirm it.")}
        <div class="money-breakdown">${moneyRow("Agreed price — held now", offer.amount, { strong: true })}</div>
        <p class="pay-note">The task is assigned to <strong>${esc(offer.offerer.name)}</strong>, and everyone else who applied or made an offer is told it's taken.</p>`;
    } else if (isTask) {
      title = `Accept ${formatRand(offer.amount)}?`;
      buttonText = "Accept offer";
      heldMessage = `Offer accepted. ${formatRand(offer.amount)} is held until the poster confirms the work is done.`;
      body = `${demoPaymentBanner("This simulates the poster's payment being held in escrow until they confirm the work is done.")}
        <div class="money-breakdown">${moneyRow("You'll be paid", offer.amount, { strong: true, hint: "held by Taskify until the poster confirms" })}</div>
        <p class="pay-note">The task is assigned to you straight away.</p>`;
    } else if (role === "owner") {
      title = "Accept offer";
      buttonText = "Accept offer";
      heldMessage = `Offer accepted. The buyer's payment is held, and ${formatRand(preview.itemPrice)} is released to you after handover.`;
      body = `${demoPaymentBanner("This simulates the buyer's payment being held by Taskify until they have the item.")}
        <div class="money-breakdown">
          ${moneyRow("You'll receive", preview.itemPrice, { strong: true, hint: "released when you enter their handover code" })}
        </div>
        <p class="pay-note">The item is reserved for <strong>${esc(offer.offerer.name)}</strong> and every other offer is closed. They pay the ${formatRand(preview.protectionFee)} protection fee.</p>`;
    } else {
      title = "Accept & pay with Taskify Protection";
      buttonText = "Accept & pay";
      heldMessage = `Offer accepted. ${formatRand(preview.total)} is held until you have the item. Your handover code is ready.`;
      body = `${demoPaymentBanner("No real payment gateway is connected. This simulates Taskify holding your money until you receive the item.")}
        <div class="money-breakdown">
          ${moneyRow("Agreed price", preview.itemPrice, { hint: "goes to the seller after handover" })}
          ${moneyRow(`Protection fee (${preview.protectionFeePercent}%)`, preview.protectionFee)}
          ${moneyRow("Total to hold", preview.total, { strong: true })}
        </div>
        <p class="pay-note">You'll get a <strong>4-digit handover code</strong>. Only show it to the seller once you have the item.</p>`;
    }

    document.getElementById("offerConfirmTitle").textContent = title;
    document.getElementById("offerConfirmBody").innerHTML = body;
    const btn = document.getElementById("offerConfirmButton");
    btn.querySelector("span").textContent = buttonText;
    btn.disabled = false;
    btn.onclick = async () => {
      btn.disabled = true;
      btn.querySelector("span").textContent = "Holding payment…";
      try {
        await apiRequest(`/offers/${offer.id}/accept`, "PATCH", { expectedAmount: offer.amount });
        closeModal(document.getElementById("offerConfirmModal"));
        showPaymentMoment("held", heldMessage);
        state.onListingChanged?.();
      } catch (err) {
        closeModal(document.getElementById("offerConfirmModal"));
        showToast(err.message, "error");
        await loadOffers();
      }
    };
    openModal(document.getElementById("offerConfirmModal"));
  }

  async function closeOfferAction(offer, action, btn) {
    const words = WORDS[offer.context_type];
    const question = action === "decline"
      ? `Decline ${esc(offer.offerer.name)}'s offer of ${formatRand(offer.amount)}?`
      : `Withdraw your offer on this ${words.noun}?`;
    if (!confirm(question)) return;
    btn.disabled = true;
    try {
      await apiRequest(`/offers/${offer.id}/${action}`, "PATCH");
      showToast(action === "decline" ? "Offer declined." : "Offer withdrawn.");
    } catch (err) {
      showToast(err.message, "error");
    }
    await loadOffers();
  }

  async function loadOffers() {
    try {
      const res = await apiRequest(`/offers?contextType=${state.contextType}&contextId=${encodeURIComponent(state.contextId)}`);
      state.data = res.data;
    } catch (err) {
      console.error("Failed to load offers:", err);
      state.data = null;
    }
    renderSection();
    refreshMakeOfferButton();
  }

  window.initOffers = function initOffers(options) {
    state = { ...options, data: null };
    ensureModals();

    if (state.applyButton) {
      state.applyButton.addEventListener("click", () => {
        if (!requireAuthAction("Sign in to apply for this task.")) return;
        const myOpen = state.data?.offers?.find(o => o.status === "Pending" && o.my_role === "offerer");
        if (myOpen) { state.sectionEl?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        if (!state.data?.rules) { showToast("Applications couldn't be loaded. Please refresh the page.", "error"); return; }
        openOfferForm({ mode: "apply" });
      });
    }

    if (state.makeOfferButton) {
      state.makeOfferButton.addEventListener("click", () => {
        if (!requireAuthAction("Sign in to make an offer.")) return;
        const myOpen = state.data?.offers?.find(o => o.status === "Pending" && o.my_role === "offerer");
        if (myOpen) { state.sectionEl?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        if (!state.data?.rules) { showToast("Offers couldn't be loaded. Please refresh the page.", "error"); return; }
        openOfferForm({ mode: "create" });
      });
    }

    /* Guests see the button (it sends them to sign in) but no panel. */
    if (!getCurrentUser()) return;
    loadOffers();
  };
})();
