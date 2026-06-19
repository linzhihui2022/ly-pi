(function () {
  const WS_URL = "ws://" + window.location.host;
  let ws = null;
  let eventQueue = [];
  let confirmed = false;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      eventQueue.forEach((e) => ws.send(JSON.stringify(e)));
      eventQueue = [];
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "reload") {
        window.location.reload();
      }
    };

    ws.onclose = () => {
      setTimeout(connect, 1000);
    };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  function updateIndicator() {
    const indicator = document.getElementById("indicator-text");
    const confirmBtn = document.getElementById("confirm-btn");
    if (!indicator || !confirmBtn) return;

    const selected = document.querySelectorAll(
      ".options .selected, .cards .selected",
    );

    if (selected.length === 0) {
      indicator.textContent = "Click an option above, then confirm";
      confirmBtn.style.display = "none";
      confirmBtn.disabled = true;
    } else if (selected.length === 1) {
      const label =
        selected[0]
          .querySelector("h3, .content h3, .card-body h3")
          ?.textContent?.trim() || selected[0].dataset.choice;
      indicator.innerHTML =
        '<span class="selected-text">' + label + "</span> selected";
      confirmBtn.style.display = "inline-block";
      confirmBtn.disabled = false;
    } else {
      indicator.innerHTML =
        '<span class="selected-text">' + selected.length + "</span> selected";
      confirmBtn.style.display = "inline-block";
      confirmBtn.disabled = false;
    }
  }

  function showDoneOverlay(selectionText) {
    const overlay = document.createElement("div");
    overlay.id = "done-overlay";
    overlay.innerHTML = `
      <div class="done-content">
        <div class="done-icon">✓</div>
        <h2>已确认</h2>
        <p class="done-selection">${selectionText}</p>
        <p class="done-hint">请切换回终端继续对话</p>
        <button class="done-close-btn" onclick="window.close()">关闭窗口</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function doConfirm() {
    if (confirmed) return;

    const selected = document.querySelectorAll(
      ".options .selected, .cards .selected",
    );
    const choices = Array.from(selected).map((el) => el.dataset.choice);
    const choice = choices.length === 1 ? choices[0] : choices;

    const labels = Array.from(selected).map(
      (el) =>
        el
          .querySelector("h3, .content h3, .card-body h3")
          ?.textContent?.trim() || el.dataset.choice,
    );

    sendEvent({
      type: "confirm",
      choice: choice,
      text: labels.join(", "),
      count: choices.length,
    });

    confirmed = true;

    const indicator = document.getElementById("indicator-text");
    const confirmBtn = document.getElementById("confirm-btn");
    if (indicator) {
      indicator.innerHTML =
        '<span class="selected-text">Confirmed: ' +
        labels.join(", ") +
        "</span>";
    }
    if (confirmBtn) {
      confirmBtn.style.display = "none";
    }

    // Disable further selection
    document.querySelectorAll(".option, .card").forEach((el) => {
      el.style.pointerEvents = "none";
      el.style.opacity = "0.6";
    });

    // Show done overlay
    showDoneOverlay(labels.join(", "));

    // Try to refocus the parent window (terminal) if opened via window.open
    if (window.opener) {
      try {
        window.opener.focus();
      } catch (e) {
        /* ignore cross-origin */
      }
      // Attempt to close this window after a brief delay
      setTimeout(() => {
        try {
          window.close();
        } catch (e) {
          /* ignore */
        }
      }, 800);
    }

    // Play a subtle sound to alert the user (browser policy permitting)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      /* ignore audio failures */
    }
  }

  // Capture clicks on choice elements
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-choice]");
    if (target) {
      if (confirmed) return; // ignore after confirmed

      sendEvent({
        type: "click",
        text: target.textContent.trim(),
        choice: target.dataset.choice,
        id: target.id || null,
      });

      setTimeout(updateIndicator, 0);
      return;
    }

    const confirmBtn = e.target.closest("#confirm-btn");
    if (confirmBtn) {
      doConfirm();
    }
  });

  // Frame UI: selection tracking
  window.selectedChoice = null;

  window.toggleSelect = function (el) {
    if (confirmed) return;

    const container = el.closest(".options") || el.closest(".cards");
    const multi = container && container.dataset.multiselect !== undefined;
    if (container && !multi) {
      container
        .querySelectorAll(".option, .card")
        .forEach((o) => o.classList.remove("selected"));
    }
    if (multi) {
      el.classList.toggle("selected");
    } else {
      el.classList.add("selected");
    }
    window.selectedChoice = el.dataset.choice;
  };

  // Expose API for explicit use
  window.brainstorm = {
    send: sendEvent,
    choice: (value, metadata = {}) =>
      sendEvent({ type: "choice", value, ...metadata }),
    confirm: doConfirm,
  };

  connect();
})();
