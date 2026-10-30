// monday.com → Five9 request tracker import.
//   npm run import-monday            dry run: shows what would be created
//   npm run import-monday -- --apply  writes it
// Safe to re-run: items, updates, and files already imported are skipped.
// Needs MONDAY_API_TOKEN plus the Supabase keys in .env.local.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const monday = async (query) => {
  const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { Authorization: process.env.MONDAY_API_TOKEN, "Content-Type": "application/json", "API-Version": "2024-10" }, body: JSON.stringify({ query }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data;
};
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Every board in a mapped workspace whose name is in TYPE_BY_SUBBOARD.
const ITEM_FIELDS = `id name created_at updated_at creator { name email } group { title }
  column_values { id type text value column { title } }
  updates(limit: 100) { id body created_at creator { name email } assets { id name file_size } }`;
async function loadBoards() {
  const { boards } = await monday(`{ boards(limit: 200, state: active) { id name type workspace { name } } }`);
  const wanted = boards.filter((b) => b.type === "board" && BOARD_BY_WORKSPACE[b.workspace?.name] && TYPE_BY_SUBBOARD[b.name]);
  const out = [];
  for (const b of wanted) {
    const items = [];
    let page = (await monday(`{ boards(ids: ${b.id}) { items_page(limit: 100) { cursor items { ${ITEM_FIELDS} } } } }`)).boards[0].items_page;
    items.push(...page.items);
    while (page.cursor) {
      page = (await monday(`{ next_items_page(limit: 100, cursor: "${page.cursor}") { cursor items { ${ITEM_FIELDS} } } }`)).next_items_page;
      items.push(...page.items);
    }
    out.push({ id: b.id, name: b.name, workspace: b.workspace.name, items });
  }
  return out;
}

// ---- Mappings ---------------------------------------------------------------
const BOARD_BY_WORKSPACE = {
  "Upswing Golf": { slug: "upswing-golf", name: "UpSwing Golf" },
  "Northwestern": { slug: "northwestern-golf", name: "Northwestern Golf" },
  "Golf Live": { slug: "golf-live", name: "Golf Live" },
  "Trump Golf": { slug: "trump-golf", name: "Trump Golf" },
  "EA Carts": { slug: "ea-carts", name: "EA Carts" },
  "PGA Memes": { slug: "pga-memes", name: "PGA Memes" },
  "Golfforever": { slug: "golfforever", name: "Golfforever" },
  "five9 Media": { slug: "five9-media", name: "Five9 Media" },
};
const TYPE_BY_SUBBOARD = {
  "Projects": { key: "project", name: "Project" },
  "Edits": { key: "edit", name: "Edit" },
  "Reels": { key: "reel", name: "Reel" },
  "EA Cart Reels": { key: "reel", name: "Reel" },
  "Play A Hole Reels": { key: "play-a-hole-reel", name: "Play A Hole Reel" },
  "Hole of the Week": { key: "hole-of-the-week", name: "Hole of the Week" },
  "Club Life": { key: "club-life", name: "Club Life" },
  "Product Design": { key: "product-design", name: "Product Design" },
  "PMC": { key: "pmc", name: "PMC" },
};
const STATUS = { "Not Started": "new", "In-Progress": "in_progress", "In Progress": "in_progress", "On Hold": "waiting", "On-Hold": "waiting", "In Review": "creative_review", "In-Review": "creative_review", "Completed": "completed" };
const NEW_PEOPLE = {
  "kris@pgamemes.com": "Kris Lezon",
  "brian@pgamemes.com": "Brian Rossen",
  "chelsea@upswinggolf.com": "Chelsea Chamberlain",
};
const REQUESTER_ONLY = new Set(["chelsea@upswinggolf.com"]);

function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}
/** monday update HTML → readable text that keeps links. */
function htmlToText(html) {
  let s = html || "";
  s = s.replace(/<a[^>]*class="[^"]*user_mention[^"]*"[^>]*>(.*?)<\/a>/gi, "$1"); // @mentions → plain name
  s = s.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href, label) => {
    const text = decode(label.replace(/<[^>]+>/g, "")).trim();
    const url = decode(href);
    return !text || text === url || url.includes(text) ? url : `${text} (${url})`;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ");
  s = decode(s.replace(/<[^>]+>/g, "")).replace(/[\u200b\ufeff]/g, "");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (s.length > 3900) s = s.slice(0, 3850) + "\n\n[Trimmed — see the original in monday.com]";
  return s;
}
const col = (item, title) => item.column_values.find((c) => c.column.title === title);
const personIds = (item) => {
  const c = item.column_values.find((v) => v.type === "people" || v.type === "person");
  if (!c?.value) return [];
  try { return (JSON.parse(c.value).personsAndTeams ?? []).filter((p) => p.kind === "person").map((p) => String(p.id)); } catch { return []; }
};

const boardsData = await loadBoards();
const mondayUsers = (await monday(`{ users(limit: 200) { id name email } }`)).users;

// ---- People ---------------------------------------------------------------
const emailByMondayId = new Map(mondayUsers.map((u) => [String(u.id), u.email.toLowerCase()]));
const profiles = must(await sb.from("profiles").select("id, email"));
const profileByEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p.id]));
const plan = { createPeople: [], createBoards: [], createTypes: [], access: [], requests: 0, comments: 0, files: 0, archived: 0, open: 0, skipped: 0 };

for (const [email, name] of Object.entries(NEW_PEOPLE)) {
  if (profileByEmail.has(email)) continue;
  plan.createPeople.push(`${name} <${email}>`);
  if (APPLY) {
    const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: false, user_metadata: { full_name: name } });
    if (error) throw new Error(`${email}: ${error.message}`);
    must(await sb.from("profiles").upsert({ id: data.user.id, email, full_name: name, role: "member", is_active: true }));
    profileByEmail.set(email, data.user.id);
  } else profileByEmail.set(email, `new:${email}`);
}
const travisId = profileByEmail.get("travis@pgamemes.com");
const userFor = (email) => (email ? profileByEmail.get(email.toLowerCase()) ?? null : null);

// ---- Boards & types ---------------------------------------------------------
const boards = must(await sb.from("boards").select("id, slug"));
const boardBySlug = new Map(boards.map((b) => [b.slug, b.id]));
for (const target of Object.values(BOARD_BY_WORKSPACE)) {
  if (boardBySlug.has(target.slug)) continue;
  plan.createBoards.push(target.name);
  if (APPLY) boardBySlug.set(target.slug, must(await sb.from("boards").insert({ name: target.name, slug: target.slug }).select("id").single()).id);
  else boardBySlug.set(target.slug, `new:${target.slug}`);
}
const types = new Set(must(await sb.from("request_types").select("key")).map((t) => t.key));
for (const t of Object.values(TYPE_BY_SUBBOARD)) {
  if (types.has(t.key)) continue;
  types.add(t.key);
  plan.createTypes.push(t.name);
  if (APPLY) must(await sb.from("request_types").insert({ key: t.key, name: t.name, sort_order: 5 }));
}

// ---- Board access: team for PGA Memes staff where they appear; Chelsea requester on UpSwing ----
const accessWanted = new Map(); // `${boardId}|${userId}` → access
for (const b of boardsData) {
  const boardId = boardBySlug.get(BOARD_BY_WORKSPACE[b.workspace].slug);
  for (const item of b.items) {
    const emails = new Set([
      ...personIds(item).map((id) => emailByMondayId.get(id)),
      item.creator?.email?.toLowerCase(),
      ...item.updates.map((u) => u.creator?.email?.toLowerCase()),
    ].filter(Boolean));
    for (const email of emails) {
      if (["geoff@pgamemes.com", "travis@pgamemes.com"].includes(email)) continue; // admins see everything
      const userId = userFor(email);
      if (!userId) continue;
      accessWanted.set(`${boardId}|${userId}|${email}`, REQUESTER_ONLY.has(email) ? "requester" : "team");
    }
  }
}
const existingAccess = new Set(must(await sb.from("board_members").select("board_id, user_id")).map((m) => `${m.board_id}|${m.user_id}`));
for (const [key, access] of accessWanted) {
  const [boardId, userId, email] = key.split("|");
  if (existingAccess.has(`${boardId}|${userId}`)) continue;
  plan.access.push(`${email} → ${[...Object.values(BOARD_BY_WORKSPACE)].find((t) => boardBySlug.get(t.slug) === boardId)?.name} (${access})`);
  if (APPLY) must(await sb.from("board_members").insert({ board_id: boardId, user_id: userId, access }));
}

// ---- Requests ---------------------------------------------------------------
const already = new Map(must(await sb.from("requests").select("id, external_ref").not("external_ref", "is", null)).map((r) => [r.external_ref, r.id]));
const doneComments = new Set(must(await sb.from("request_comments").select("external_ref").not("external_ref", "is", null)).map((c) => c.external_ref));
if (APPLY) {
  const { data: bucket } = await sb.storage.getBucket("request-files");
  if (!bucket) must(await sb.storage.createBucket("request-files", { public: false, fileSizeLimit: 50 * 1024 * 1024 }));
}
const now = new Date().toISOString();
const sample = [];

for (const b of boardsData) {
  const boardId = boardBySlug.get(BOARD_BY_WORKSPACE[b.workspace].slug);
  const type = TYPE_BY_SUBBOARD[b.name];
  let order = 0;
  for (const item of b.items) {
    order += 1;
    const ref = `monday:${item.id}`;
    const existingId = already.get(ref);
    if (existingId) plan.skipped++;
    const statusText = col(item, "Status")?.text ?? "";
    const groupDone = item.group.title === "Completed";
    const status = groupDone || STATUS[statusText] === "completed" ? "completed" : (STATUS[statusText] ?? "new");
    const due = (col(item, "Due date") ?? col(item, "Date"))?.text?.slice(0, 10) || null;
    const requester = userFor(item.creator?.email) ?? travisId;
    const assignees = [...new Set(personIds(item).map((id) => userFor(emailByMondayId.get(id))).filter(Boolean))];
    const updates = [...item.updates].sort((a, c) => a.created_at.localeCompare(c.created_at));
    const files = updates.flatMap((u) => u.assets ?? []).slice(0, 10);
    if (!existingId) {
      plan.requests++; plan.files += files.length;
      if (status === "completed") plan.archived++; else plan.open++;
    }
    plan.comments += updates.filter((u) => !doneComments.has(`monday-update:${u.id}`)).length;
    if (sample.length < 3 && updates.length) sample.push({ title: item.name, status, due, comment: htmlToText(updates[0].body).slice(0, 300) });
    if (!APPLY) continue;

    const request = existingId ? { id: existingId } : must(await sb.from("requests").insert({
      board_id: boardId,
      title: item.name.slice(0, 160),
      description: null,
      status,
      priority: "normal",
      request_type: type.key,
      due_date: due,
      requester_id: requester,
      created_by: requester,
      sort_order: order * 1024,
      created_at: item.created_at,
      archived_at: status === "completed" ? now : null,
      external_ref: ref,
    }).select("id").single());
    if (!existingId && status === "completed") {
      // monday doesn't record when an item was finished; its last change is the best stand-in.
      must(await sb.from("requests").update({ completed_at: item.updated_at ?? item.created_at }).eq("id", request.id));
    }
    if (!existingId && assignees.length) must(await sb.from("request_assignees").insert(assignees.map((user_id) => ({ request_id: request.id, user_id, assigned_by: requester, created_at: item.created_at }))));
    for (const u of updates) {
      if (doneComments.has(`monday-update:${u.id}`)) continue;
      const body = htmlToText(u.body) || "(empty update)";
      must(await sb.from("request_comments").insert({
        request_id: request.id,
        author_id: userFor(u.creator?.email) ?? travisId,
        body,
        is_internal: false,
        kind: "comment",
        created_at: u.created_at,
        external_ref: `monday-update:${u.id}`,
      }));
    }
    const hasFiles = existingId
      ? Boolean(must(await sb.from("request_attachments").select("id").eq("request_id", request.id).limit(1)).length)
      : false;
    if (files.length && !hasFiles) {
      const { assets } = await monday(`{ assets(ids: [${files.map((f) => f.id).join(",")}]) { id name public_url file_size } }`);
      for (const asset of assets) {
        const res = await fetch(asset.public_url);
        if (!res.ok) { console.log(`  ! couldn't download ${asset.name}`); continue; }
        const bytes = Buffer.from(await res.arrayBuffer());
        const safe = asset.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
        const path = `${request.id}/${randomUUID()}-${safe}`;
        const uploaded = await sb.storage.from("request-files").upload(path, bytes, { contentType: res.headers.get("content-type") ?? undefined });
        if (uploaded.error) {
          const mb = (bytes.length / 1024 / 1024).toFixed(0);
          console.log(`  ! ${asset.name} (${mb} MB) not copied: ${uploaded.error.message}`);
          must(await sb.from("request_comments").insert({
            request_id: request.id,
            author_id: travisId,
            body: `File “${asset.name}” (${mb} MB) was too large to copy from monday.com (50 MB limit). It's still attached to the original item there.`,
            is_internal: true,
            kind: "comment",
            external_ref: `monday-asset-skipped:${asset.id}`,
          }));
          continue;
        }
        const uploader = updates.find((u) => (u.assets ?? []).some((a) => a.id === asset.id))?.creator?.email;
        must(await sb.from("request_attachments").insert({ request_id: request.id, file_name: asset.name.slice(0, 255), file_size: bytes.length, storage_path: path, uploaded_by: userFor(uploader) ?? travisId }));
      }
    }
  }
}

console.log(APPLY ? "APPLIED" : "DRY RUN — nothing written");
console.log("New people:", plan.createPeople.join("; ") || "none");
console.log("New boards:", plan.createBoards.join(", ") || "none");
console.log("New request types:", plan.createTypes.join(", ") || "none");
console.log("Board access:\n  " + (plan.access.join("\n  ") || "none"));
console.log(`New requests: ${plan.requests} (${plan.open} open on boards, ${plan.archived} completed → archive), already imported: ${plan.skipped}`);
console.log(`New conversation entries: ${plan.comments}, files on new requests: ${plan.files}`);
console.log("Samples:", JSON.stringify(sample, null, 1));
