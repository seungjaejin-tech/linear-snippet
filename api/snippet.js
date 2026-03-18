/**
 * 채널톡 스니펫 서버 — 리니어 이슈 연결 위젯
 *
 * 이 파일 하나가 스니펫 서버의 전부입니다.
 * Vercel에 배포하면 https://{주소}/api/snippet 으로 접근 가능합니다.
 *
 * 기능:
 * - 매니저가 채팅을 열면 → 연결된 리니어 이슈 URL 표시
 * - "이슈 추가" 버튼 → 입력칸 추가 (최대 3개)
 * - "저장" 버튼 → 매핑 저장
 * - "초기화" 버튼 → 연결 모두 해제
 */

// ===== 간이 저장소 =====
// ⚠️ Vercel 서버리스에서는 재시작 시 초기화됩니다.
// 실제 운영 시 Supabase, PlanetScale 등 외부 DB로 교체하세요.
const storage = new Map();

function getMappings(chatId) {
  return storage.get(chatId) || [];
}

function saveMappings(chatId, urls) {
  const filtered = urls.filter((u) => u && u.trim() !== "");
  storage.set(chatId, filtered.slice(0, 3));
}

// ===== 리니어 URL 유효성 검사 =====
function isValidLinearUrl(url) {
  return /^https?:\/\/linear\.app\/.+\/issue\/.+/i.test(url);
}

function parseIssueId(url) {
  const match = url.match(/\/issue\/([A-Z0-9]+-\d+)/i);
  return match ? match[1] : null;
}

// ===== 위젯 화면 생성 =====
function buildLayout(urls, inputCount, message) {
  const layout = [];

  // 헤더
  layout.push({
    id: "header",
    type: "text",
    text: "🔗 리니어 이슈 연결",
    style: "header",
  });

  // 상태 메시지 or 안내 문구
  if (message) {
    layout.push({ id: "message", type: "text", text: message, style: "paragraph" });
  } else {
    const countText = urls.length > 0 ? `(${urls.length}/3)` : "(최대 3개)";
    layout.push({
      id: "desc",
      type: "text",
      text: `리니어 이슈 URL을 입력하고 저장하세요. ${countText}`,
      style: "paragraph",
    });
  }

  layout.push({ id: "divider-top", type: "divider", size: "thin" });
  layout.push({ id: "spacer-top", type: "spacer", size: "xs" });

  // 입력칸 (현재 보여줄 개수 계산)
  const showCount = Math.min(Math.max(inputCount, urls.length, 1), 3);

  for (let i = 0; i < showCount; i++) {
    layout.push({
      id: `issue-label-${i + 1}`,
      type: "text",
      text: `이슈 ${i + 1}`,
      style: "caption",
    });

    const input = {
      id: `linear-url-${i + 1}`,
      type: "input",
      label: "",
      placeholder: "https://linear.app/sazo/issue/...",
    };
    if (urls[i]) input.value = urls[i];

    layout.push(input);
    layout.push({ id: `spacer-${i + 1}`, type: "spacer", size: "xs" });
  }

  // "이슈 추가" 버튼 (3개 미만일 때만)
  if (showCount < 3) {
    const remaining = 3 - showCount;
    layout.push({
      id: "add-issue-btn",
      type: "button",
      label: `➕ 이슈 추가 (${remaining}개 남음)`,
      style: "default",
      action: { type: "submit" },
    });
    layout.push({ id: "spacer-add", type: "spacer", size: "xs" });
  }

  // "저장" 버튼
  layout.push({
    id: "save-btn",
    type: "button",
    label: "💾 저장",
    style: "primary",
    action: { type: "submit" },
  });

  // 이미 저장된 이슈가 있으면 "초기화" 버튼도 표시
  if (urls.length > 0) {
    layout.push({ id: "spacer-reset", type: "spacer", size: "xs" });
    layout.push({
      id: "reset-btn",
      type: "button",
      label: "🗑️ 연결 모두 해제",
      style: "default",
      action: { type: "submit" },
    });
  }

  return layout;
}

// ===== 메인 핸들러 =====
export default function handler(req, res) {
  // CORS 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const chatId = body.user?.id || "unknown";
  const componentId = body.componentId;
  const submitData = body.submit || {};
  const params = body.snippet?.params || {};

  let inputCount = params.inputCount || 1;
  let savedUrls = getMappings(chatId);
  let message = null;

  // === Submit 처리 (버튼 클릭 시) ===
  if (componentId) {
    // 현재 입력된 URL 수집
    const currentUrls = [];
    for (let i = 1; i <= 3; i++) {
      const url = submitData[`linear-url-${i}`];
      if (url !== undefined) currentUrls.push(url.trim());
    }

    if (componentId === "add-issue-btn") {
      // 입력칸 추가
      inputCount = Math.min((params.inputCount || currentUrls.length || 1) + 1, 3);
      savedUrls = currentUrls; // 입력 중인 값 유지

    } else if (componentId === "save-btn") {
      // 저장: URL 유효성 검사 후 저장
      const validUrls = currentUrls.filter((u) => u !== "");

      const invalidUrls = validUrls.filter((u) => !isValidLinearUrl(u));
      if (invalidUrls.length > 0) {
        message = "⚠️ 올바른 리니어 URL을 입력해주세요.\n예: https://linear.app/sazo/issue/J2KL-2109";
        savedUrls = currentUrls;
        inputCount = Math.max(currentUrls.length, 1);
      } else {
        saveMappings(chatId, validUrls);
        savedUrls = getMappings(chatId);
        inputCount = Math.max(savedUrls.length, 1);

        if (savedUrls.length > 0) {
          const ids = savedUrls.map((u) => parseIssueId(u)).join(", ");
          message = `✅ ${savedUrls.length}개 이슈 저장 완료! (${ids})`;
        } else {
          message = "ℹ️ URL을 입력하고 저장해주세요.";
        }
      }

    } else if (componentId === "reset-btn") {
      // 연결 모두 해제
      storage.delete(chatId);
      savedUrls = [];
      inputCount = 1;
      message = "🗑️ 모든 이슈 연결이 해제되었습니다.";
    }

  } else {
    // === Initialize (채팅 처음 열 때) ===
    inputCount = Math.max(savedUrls.length, 1);
  }

  // 응답
  return res.status(200).json({
    snippet: {
      version: "v0",
      layout: buildLayout(savedUrls, inputCount, message),
      params: { inputCount },
    },
  });
}
