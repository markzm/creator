export async function enrichProjects(db: D1Database, projects: any[]) {
  if (!projects.length) return [];
  // VALUES is a constant coroutine in SQLite: unlike IN it does not scan an ephemeral ID table.
  const wanted = `WITH wanted(id) AS (VALUES ${projects.map(() => '(?)').join(',')})`;
  const ids = projects.map(p => p.id);
  const data = await db.batch([
    db.prepare(`${wanted} SELECT m.project_id, m.user_id as userId, u.nickname as name, u.avatar_url as avatar, m.role, m.created_at as joinedAt
      FROM wanted p JOIN cocreation_members m ON m.project_id = p.id JOIN users u ON u.id = m.user_id`).bind(...ids),
    db.prepare(`${wanted} SELECT s.cocreation_id, COUNT(*) as count FROM wanted p
      JOIN world_shares s ON s.cocreation_id = p.id WHERE canon_review = 'pending' AND visibility = 'public' GROUP BY cocreation_id`).bind(...ids)
  ]);
  const members = new Map<string, any[]>();
  for (const row of data[0].results as any[]) {
    const { project_id, ...member } = row;
    if (!members.has(project_id)) members.set(project_id, []);
    members.get(project_id)!.push(member);
  }
  for (const group of members.values()) group.sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.joinedAt - b.joinedAt || a.userId - b.userId);
  const pending = new Map(data[1].results.map((r: any) => [r.cocreation_id, Number(r.count)]));
  return projects.map(p => {
    let admins: string[] = [];
    try { admins = JSON.parse(p.admins_json || '[]'); } catch { /* legacy display data */ }
    return { id: p.id, worldId: p.world_id, worldTitle: p.world_title, ownerId: p.owner_id, ownerName: p.owner_name,
      admins, members: members.get(p.id) || [], summary: p.summary || '', isOpenDoujin: !!p.is_open_doujin,
      pendingCount: pending.get(p.id) || 0, createdAt: p.created_at, updatedAt: p.updated_at };
  });
}
