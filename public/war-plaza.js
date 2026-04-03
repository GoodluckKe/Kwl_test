(function () {
  const bootEl = document.getElementById("warPlazaBoot");
  const boot = bootEl ? JSON.parse(bootEl.textContent || "{}") : {};

  const refs = {
    refreshBtn: document.getElementById("wpRefreshBtn"),
    status: document.getElementById("wpStatus"),
    feedList: document.getElementById("wpFeedList"),
    kpiTotal: document.getElementById("wpKpiTotal"),
    kpiMine: document.getElementById("wpKpiMine"),
    kpiLikes: document.getElementById("wpKpiLikes"),
    kpiComments: document.getElementById("wpKpiComments"),
    permLogin: document.getElementById("wpPermLogin"),
    permPlaza: document.getElementById("wpPermPlaza"),
    permAutoShare: document.getElementById("wpPermAutoShare"),
    permHint: document.getElementById("wpPermHint"),
    battleDigestList: document.getElementById("wpBattleDigestList"),
    tabs: Array.from(document.querySelectorAll(".wp-tab")),
    titleInput: document.getElementById("wpPostTitle"),
    contentInput: document.getElementById("wpPostContent"),
    tagsInput: document.getElementById("wpPostTags"),
    publishBtn: document.getElementById("wpPublishBtn"),
    chips: Array.from(document.querySelectorAll(".wp-chip")),
    authConnect: document.getElementById("wpAuthConnect"),
    authCodeInput: document.getElementById("wpAuthCodeInput"),
    authCodeBtn: document.getElementById("wpAuthCodeBtn"),
  };

  const state = {
    loading: false,
    syncedOnce: false,
    tab: "all",
    posts: [],
    comments: new Map(),
    replyTo: new Map(),
    summary: {
      totalPosts: 0,
      myPosts: 0,
      myReceivedLikes: 0,
      myReceivedComments: 0,
    },
    permissions: {
      secondMeLogin: true,
      plazaTokenBound: false,
      plazaTokenSource: "",
      autoBattleShareEnabled: true,
    },
    battleSummary: {
      total: 0,
      posted: 0,
      pending: 0,
    },
    battleDigest: [],
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatTime(value) {
    const time = Number(value);
    if (!Number.isFinite(time) || time <= 0) return "刚刚";
    return new Date(time).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setStatus(text) {
    if (!refs.status) return;
    refs.status.textContent = String(text || "");
  }

  function parseTags(text) {
    return String(text || "")
      .split(/[#,，,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function escapeSelector(value) {
    const text = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(text);
    }
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function extractSmcCode(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const match = text.match(/smc-[A-Za-z0-9_-]+/);
    return match ? match[0] : "";
  }

  async function requestJson(url, options) {
    const resp = await fetch(url, options);
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.ok !== true) {
      const errorCode = (json && json.error) || `request_failed_${resp.status}`;
      const detail = json && json.detail ? `:${json.detail}` : "";
      throw new Error(`${errorCode}${detail}`);
    }
    return json;
  }

  function isPlazaNotActivatedError(error) {
    const text = String((error && error.message) || error || "");
    return text.includes("plaza_not_activated") || text.includes("invitation.required");
  }

  function isPlazaAgentTokenInvalid(error) {
    const text = String((error && error.message) || error || "");
    return text.includes("plaza_agent_token_invalid") || text.includes("third.party.agent.token.invalid");
  }

  function toggleAuthConnect(show) {
    if (!refs.authConnect) return;
    refs.authConnect.hidden = !show;
  }

  function renderSummary() {
    if (refs.kpiTotal) refs.kpiTotal.textContent = String(state.summary.totalPosts || 0);
    if (refs.kpiMine) refs.kpiMine.textContent = String(state.summary.myPosts || 0);
    if (refs.kpiLikes) refs.kpiLikes.textContent = String(state.summary.myReceivedLikes || 0);
    if (refs.kpiComments) refs.kpiComments.textContent = String(state.summary.myReceivedComments || 0);
  }

  function renderPermissionState() {
    if (refs.permLogin) {
      refs.permLogin.textContent = state.permissions.secondMeLogin ? "已连接" : "未连接";
    }
    if (refs.permPlaza) {
      refs.permPlaza.textContent = state.permissions.plazaTokenBound ? "已授权" : "使用主令牌";
    }
    if (refs.permAutoShare) {
      refs.permAutoShare.textContent = state.permissions.autoBattleShareEnabled ? "开启" : "关闭";
    }
    if (refs.permHint) {
      const pending = Number(state.battleSummary.pending || 0);
      const posted = Number(state.battleSummary.posted || 0);
      const sourceHint = state.permissions.plazaTokenBound
        ? "当前已绑定 Plaza 专属授权码（smc）。"
        : "当前使用 SecondMe 登录令牌读写广场，建议绑定 smc 授权码以提升稳定性。";
      refs.permHint.textContent =
        sourceHint + " 自动战报已发布 " + posted + " 条，待同步 " + pending + " 条。";
    }
  }

  function renderBattleDigest() {
    if (!refs.battleDigestList) return;
    if (!Array.isArray(state.battleDigest) || state.battleDigest.length === 0) {
      refs.battleDigestList.innerHTML = '<div class="wp-empty">暂无战报记录，先打一局试试。</div>';
      return;
    }
    refs.battleDigestList.innerHTML = state.battleDigest
      .slice(0, 8)
      .map((row) => {
        const posted = Boolean(row && row.plazaPosted);
        const resultWin = String(row?.result || "") === "win";
        const resultLabel = resultWin ? "胜利" : "失利";
        const hero = String(row?.hero || "未知英雄");
        const modeLabel = String(row?.modeLabel || "对战");
        const summary = String(row?.summary || "").trim();
        return (
          '<div class="wp-battle-digest-item">' +
          '<div class="wp-battle-digest-head">' +
          '<span class="wp-battle-result ' +
          (resultWin ? "win" : "loss") +
          '">' +
          resultLabel +
          "</span>" +
          '<small>' +
          escapeHtml(formatTime(row?.timestamp)) +
          "</small>" +
          "</div>" +
          '<div class="wp-battle-digest-main">' +
          escapeHtml(modeLabel + " · " + hero) +
          "</div>" +
          (summary ? '<div class="wp-battle-digest-sub">' + escapeHtml(summary) + "</div>" : "") +
          '<div class="wp-battle-digest-foot">' +
          (posted ? '<span class="posted">已同步到广场</span>' : '<span class="pending">待同步</span>') +
          (row?.plazaPostId ? '<span class="post-id">#' + escapeHtml(String(row.plazaPostId).slice(0, 12)) + "</span>" : "") +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function currentPosts() {
    if (state.tab === "mine") {
      return state.posts.filter((post) => post && post.isMine);
    }
    return state.posts;
  }

  function renderCommentList(postId) {
    const comments = Array.isArray(state.comments.get(postId)) ? state.comments.get(postId) : [];
    if (comments.length === 0) {
      return '<div class="wp-empty">暂时还没有评论，来抢个沙发吧。</div>';
    }
    return comments
      .map((comment) => {
        const parentLine = comment.parentId
          ? '<small style="color:#93c5fd;margin-left:6px;">回复评论</small>'
          : "";
        return (
          '<div class="wp-comment-item">' +
          '<div class="wp-comment-head"><span>' +
          escapeHtml(comment.author && comment.author.name ? comment.author.name : "SecondMe 玩家") +
          parentLine +
          "</span><span>" +
          escapeHtml(formatTime(comment.createdAt)) +
          "</span></div>" +
          '<div class="wp-comment-content">' +
          escapeHtml(comment.content || "") +
          "</div>" +
          '<div class="wp-comment-actions"><button class="wp-reply-btn" data-reply-post-id="' +
          escapeHtml(postId) +
          '" data-reply-comment-id="' +
          escapeHtml(comment.id || "") +
          '" type="button">回复</button></div>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderFeed() {
    if (!refs.feedList) return;
    const posts = currentPosts();
    if (posts.length === 0) {
      refs.feedList.innerHTML = '<div class="wp-empty">当前列表为空，先发一条战绩心得吧。</div>';
      return;
    }
    refs.feedList.innerHTML = posts
      .map((post) => {
        const tags = Array.isArray(post.tags) ? post.tags : [];
        const commentsOpen = state.comments.has(post.id);
        const replyTarget = state.replyTo.get(post.id) || "";
        return (
          '<article class="wp-post" data-post-id="' +
          escapeHtml(post.id) +
          '">' +
          '<div class="wp-post-head"><div class="wp-post-author">' +
          '<img src="' +
          escapeHtml((post.author && post.author.avatar) || "/assets/bg-myth-war.png") +
          '" alt="' +
          escapeHtml((post.author && post.author.name) || "SecondMe 玩家") +
          '" />' +
          "<div><strong>" +
          escapeHtml((post.author && post.author.name) || "SecondMe 玩家") +
          '</strong><small>' +
          escapeHtml(formatTime(post.createdAt)) +
          "</small></div></div>" +
          (post.isMine ? '<span class="wp-post-own">我的分享</span>' : "") +
          "</div>" +
          (post.title ? '<h3 class="wp-post-title">' + escapeHtml(post.title) + "</h3>" : "") +
          '<div class="wp-post-content">' +
          escapeHtml(post.content || "") +
          "</div>" +
          (tags.length
            ? '<div class="wp-post-tags">' +
              tags.map((tag) => "<span>#" + escapeHtml(tag) + "</span>").join("") +
              "</div>"
            : "") +
          '<div class="wp-post-actions">' +
          '<button class="wp-action-btn like ' +
          (post.likedByMe ? "active" : "") +
          '" type="button" data-like-post-id="' +
          escapeHtml(post.id) +
          '">点赞 ' +
          escapeHtml(post.likeCount || 0) +
          "</button>" +
          '<button class="wp-action-btn comment" type="button" data-comment-post-id="' +
          escapeHtml(post.id) +
          '">评论 ' +
          escapeHtml(post.commentCount || 0) +
          "</button>" +
          "</div>" +
          '<div class="wp-comments ' +
          (commentsOpen ? "show" : "") +
          '" data-comment-wrap="' +
          escapeHtml(post.id) +
          '">' +
          '<div class="wp-comments-list">' +
          (commentsOpen ? renderCommentList(post.id) : '<div class="wp-empty">点击评论按钮加载互动内容。</div>') +
          "</div>" +
          '<div class="wp-comment-form">' +
          '<input class="wp-comment-input" type="text" maxlength="2000" placeholder="' +
          (replyTarget ? "回复该评论..." : "写下你的看法，和大家一起复盘") +
          '" data-comment-input="' +
          escapeHtml(post.id) +
          '" />' +
          '<button class="wp-comment-submit" type="button" data-comment-submit="' +
          escapeHtml(post.id) +
          '" data-parent-comment-id="' +
          escapeHtml(replyTarget) +
          '">发送</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  async function loadFeed() {
    if (state.loading) return;
    state.loading = true;
    setStatus("正在同步 SecondMe 战神广场动态...");
    try {
      if (!state.syncedOnce) {
        state.syncedOnce = true;
        try {
          const syncJson = await requestJson("/api/war-plaza/sync-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (syncJson.publishedCount > 0) {
            setStatus("已自动补发 " + syncJson.publishedCount + " 条历史战绩，正在刷新广场...");
          }
        } catch (syncError) {
          console.warn("自动补发历史战绩失败:", syncError);
        }
      }
      const json = await requestJson("/api/war-plaza/feed?limit=30");
      toggleAuthConnect(false);
      state.posts = Array.isArray(json.posts) ? json.posts : [];
      state.summary = json.summary || {
        totalPosts: state.posts.length || 0,
        myPosts: 0,
        myReceivedLikes: 0,
        myReceivedComments: 0,
      };
      state.permissions = json.permissions || state.permissions;
      state.battleSummary = json.battleSummary || state.battleSummary;
      state.battleDigest = Array.isArray(json.battleDigest) ? json.battleDigest : [];
      renderSummary();
      renderPermissionState();
      renderBattleDigest();
      setStatus(
        "动态已更新：共 " +
          (state.summary.totalPosts || state.posts.length || 0) +
          " 条，" +
          "我的分享 " +
          (state.summary.myPosts || 0) +
          " 条，收到点赞 " +
          (state.summary.myReceivedLikes || 0) +
          "。"
      );
      renderFeed();
    } catch (error) {
      console.error("加载战神广场失败:", error);
      if (isPlazaAgentTokenInvalid(error)) {
        toggleAuthConnect(true);
        setStatus("需要绑定 Plaza 授权码（smc-...）后才能读取和发布广场内容。");
      } else 
      if (isPlazaNotActivatedError(error)) {
        setStatus("SecondMe Plaza 尚未激活，请先在 SecondMe 完成广场邀请码激活。");
      } else {
        setStatus("战神广场暂时不可用，请稍后重试。");
      }
      renderPermissionState();
      renderBattleDigest();
      if (refs.feedList) {
        refs.feedList.innerHTML = '<div class="wp-empty">加载失败，请点击“刷新动态”再试一次。</div>';
      }
    } finally {
      state.loading = false;
    }
  }

  async function loadComments(postId) {
    if (!postId) return;
    try {
      const json = await requestJson(
        "/api/war-plaza/post/" + encodeURIComponent(postId) + "/comments?limit=50"
      );
      state.comments.set(postId, Array.isArray(json.comments) ? json.comments : []);
      renderFeed();
    } catch (error) {
      console.error("加载评论失败:", error);
      setStatus("评论加载失败，请稍后重试。");
    }
  }

  async function submitPost() {
    if (!refs.contentInput || !refs.publishBtn) return;
    const content = refs.contentInput.value.trim();
    if (!content) {
      setStatus("请先输入你要发布的内容。");
      return;
    }
    const title = refs.titleInput ? refs.titleInput.value.trim() : "";
    const tags = refs.tagsInput ? parseTags(refs.tagsInput.value) : [];
    refs.publishBtn.disabled = true;
    refs.publishBtn.textContent = "发布中...";
    setStatus("正在发布到 SecondMe 战神广场...");
    try {
      await requestJson("/api/war-plaza/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags }),
      });
      refs.contentInput.value = "";
      if (refs.titleInput) refs.titleInput.value = "";
      if (refs.tagsInput) refs.tagsInput.value = "";
      setStatus("发布成功，正在刷新动态...");
      await loadFeed();
    } catch (error) {
      console.error("发布帖子失败:", error);
      if (isPlazaAgentTokenInvalid(error)) {
        toggleAuthConnect(true);
        setStatus("发布失败：需要先绑定 Plaza 授权码（smc-...）。");
      } else
      if (isPlazaNotActivatedError(error)) {
        setStatus("你的 SecondMe Plaza 尚未激活，暂时无法发帖。");
      } else if (String(error?.message || "").includes("plaza_access_check_unavailable")) {
        setStatus("当前账号无法校验 Plaza 状态，请先确认 SecondMe 广场权限后再试。");
      } else {
        setStatus("发布失败：" + String(error?.message || "请稍后重试。"));
      }
    } finally {
      refs.publishBtn.disabled = false;
      refs.publishBtn.textContent = "发布到广场";
    }
  }

  async function submitComment(postId, parentId) {
    const input = document.querySelector('[data-comment-input="' + escapeSelector(postId) + '"]');
    if (!input) return;
    const content = input.value.trim();
    if (!content) {
      setStatus("评论内容不能为空。");
      return;
    }
    try {
      await requestJson("/api/war-plaza/post/" + encodeURIComponent(postId) + "/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId: parentId || "",
        }),
      });
      input.value = "";
      state.replyTo.delete(postId);
      await loadComments(postId);
      await loadFeed();
      setStatus("评论已同步到 SecondMe 战神广场。");
    } catch (error) {
      console.error("发布评论失败:", error);
      setStatus("评论发布失败，请稍后重试。");
    }
  }

  async function likePost(postId) {
    if (!postId) return;
    try {
      await requestJson("/api/war-plaza/post/" + encodeURIComponent(postId) + "/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      await loadFeed();
    } catch (error) {
      console.error("点赞失败:", error);
      setStatus("点赞失败，请稍后重试。");
    }
  }

  if (refs.tabs.length > 0) {
    refs.tabs.forEach((tab) => {
      tab.addEventListener("click", function () {
        const nextTab = tab.dataset.tab === "mine" ? "mine" : "all";
        state.tab = nextTab;
        refs.tabs.forEach((btn) => btn.classList.remove("active"));
        tab.classList.add("active");
        renderFeed();
      });
    });
  }

  if (refs.refreshBtn) {
    refs.refreshBtn.addEventListener("click", function () {
      loadFeed();
    });
  }

  if (refs.publishBtn) {
    refs.publishBtn.addEventListener("click", function () {
      submitPost();
    });
  }

  if (refs.authCodeBtn && refs.authCodeInput) {
    refs.authCodeBtn.addEventListener("click", async function () {
      const code = refs.authCodeInput.value.trim();
      const normalizedCode = extractSmcCode(code);
      if (!normalizedCode) {
        setStatus("请先粘贴 smc- 开头的授权码。");
        return;
      }
      refs.authCodeBtn.disabled = true;
      refs.authCodeBtn.textContent = "绑定中...";
      try {
        await requestJson("/api/war-plaza/auth/token-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: normalizedCode }),
        });
        refs.authCodeInput.value = "";
        toggleAuthConnect(false);
        setStatus("广场权限绑定成功，正在刷新动态...");
        await loadFeed();
      } catch (error) {
        console.error("绑定广场权限失败:", error);
        setStatus("绑定失败：" + String(error?.message || "请检查授权码后重试"));
      } finally {
        refs.authCodeBtn.disabled = false;
        refs.authCodeBtn.textContent = "绑定广场权限";
      }
    });
  }

  refs.chips.forEach((chip) => {
    chip.addEventListener("click", function () {
      if (!refs.contentInput) return;
      const preset = String(chip.dataset.preset || "");
      if (!preset) return;
      const value = refs.contentInput.value.trim();
      refs.contentInput.value = value ? value + "\n" + preset : preset + "\n";
      refs.contentInput.focus();
    });
  });

  if (refs.feedList) {
    refs.feedList.addEventListener("click", function (event) {
      const likeBtn = event.target.closest("[data-like-post-id]");
      if (likeBtn) {
        likePost(String(likeBtn.dataset.likePostId || ""));
        return;
      }

      const commentBtn = event.target.closest("[data-comment-post-id]");
      if (commentBtn) {
        const postId = String(commentBtn.dataset.commentPostId || "");
        const wrap = document.querySelector('[data-comment-wrap="' + escapeSelector(postId) + '"]');
        if (!wrap) return;
        const opening = !wrap.classList.contains("show");
        wrap.classList.toggle("show");
        if (opening && !state.comments.has(postId)) {
          loadComments(postId);
        }
        return;
      }

      const replyBtn = event.target.closest("[data-reply-comment-id]");
      if (replyBtn) {
        const postId = String(replyBtn.dataset.replyPostId || "");
        const commentId = String(replyBtn.dataset.replyCommentId || "");
        state.replyTo.set(postId, commentId);
        renderFeed();
        return;
      }

      const submitBtn = event.target.closest("[data-comment-submit]");
      if (submitBtn) {
        const postId = String(submitBtn.dataset.commentSubmit || "");
        const parentId = String(submitBtn.dataset.parentCommentId || "");
        submitComment(postId, parentId);
      }
    });

    refs.feedList.addEventListener("keydown", function (event) {
      const input = event.target.closest("[data-comment-input]");
      if (!input) return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      const postId = String(input.dataset.commentInput || "");
      const parentId = String(state.replyTo.get(postId) || "");
      submitComment(postId, parentId);
    });
  }

  if (boot && boot.viewer && boot.viewer.name) {
    setStatus("欢迎回来，" + String(boot.viewer.name) + "。正在连接 SecondMe 战神广场...");
  }
  renderSummary();
  renderPermissionState();
  renderBattleDigest();
  loadFeed();
})();
