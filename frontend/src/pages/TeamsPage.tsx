// src/pages/TeamsPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, ChevronLeft, Crown, Shield, Eye, Trash2, Mail, Layout, FileText, X, Check, Image as ImageIcon, Video, Monitor, Table } from 'lucide-react';
import { fetchMyTeams, createTeam, fetchTeamById, inviteTeamMember, removeTeamMember, createDesign } from '../api/api';
import { useAuth } from '../context/AuthContext';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  owner: { label: 'Owner', color: 'text-amber-600', bg: 'bg-amber-50', icon: Crown },
  admin: { label: 'Admin', color: 'text-violet-600', bg: 'bg-violet-50', icon: Shield },
  member: { label: 'Member', color: 'text-sky-600', bg: 'bg-sky-50', icon: Users },
  viewer: { label: 'Viewer', color: 'text-slate-500', bg: 'bg-slate-100', icon: Eye },
};

export default function TeamsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateDesignMenu, setShowCreateDesignMenu] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamMax, setNewTeamMax] = useState(10);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadTeams = async () => {
    try {
      const data = await fetchMyTeams();
      setTeams(data.teams || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadTeam = async (teamId: string) => {
    setTeamLoading(true);
    try {
      const data = await fetchTeamById(teamId);
      setActiveTeam(data);
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setTeamLoading(false); }
  };

  useEffect(() => { loadTeams(); }, []);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setActionLoading(true);
    try {
      await createTeam({ name: newTeamName.trim(), max_members: newTeamMax });
      await loadTeams();
      setShowCreateModal(false);
      setNewTeamName('');
      showToast('✅ Tạo nhóm thành công!');
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setActionLoading(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeTeam) return;
    setActionLoading(true);
    try {
      await inviteTeamMember(activeTeam.id, inviteEmail.trim(), inviteRole);
      await loadTeam(activeTeam.id);
      setShowInviteModal(false);
      setInviteEmail('');
      showToast('✅ Đã mời thành viên!');
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setActionLoading(false); }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!activeTeam || !confirm(`Xóa "${memberName}" khỏi nhóm?`)) return;
    try {
      await removeTeamMember(activeTeam.id, memberId);
      await loadTeam(activeTeam.id);
      showToast('✅ Đã xóa thành viên');
    } catch (e: any) { showToast(`❌ ${e.message}`); }
  };

  const handleCreateTeamDesign = async (type: string, pageType: string, w: number, h: number) => {
    if (!activeTeam) return;
    setActionLoading(true);
    try {
      const payload = {
        title: `Untitled Team Design`,
        design_type: type,
        page_type: pageType,
        width: w,
        height: h,
        team_id: activeTeam.id
      };
      const data = await createDesign(payload);
      if (data.id) navigate(`/design/${data.id}`);
    } catch (e: any) {
      alert('Không thể tạo thiết kế nhóm: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
            <ChevronLeft size={18} />
            <span className="text-sm font-bold">Dashboard</span>
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Users size={16} className="text-indigo-500" />
            </div>
            <h1 className="text-lg font-extrabold text-slate-800">Teams</h1>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:-translate-y-0.5"
        >
          <Plus size={15} /> Tạo nhóm mới
        </button>
      </header>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-20 right-6 z-50 bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-sm"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        {/* Teams List Sidebar */}
        <div className="w-72 border-r border-slate-100 bg-white/60 backdrop-blur-md flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nhóm của bạn ({teams.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {loading ? (
              <div className="flex justify-center pt-8">
                <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                <Users size={28} className="mx-auto mb-2 text-slate-200" />
                Bạn chưa thuộc nhóm nào
              </div>
            ) : teams.map((team) => {
              const RoleIcon = ROLE_CONFIG[team.my_role]?.icon || Users;
              return (
                <button
                  key={team.id}
                  onClick={() => loadTeam(team.id)}
                  className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all ${activeTeam?.id === team.id
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-slate-50 border border-transparent'
                    }`}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-400 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow">
                    {team.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{team.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <RoleIcon size={10} className={ROLE_CONFIG[team.my_role]?.color} />
                      <span className={`text-[10px] font-bold ${ROLE_CONFIG[team.my_role]?.color}`}>
                        {ROLE_CONFIG[team.my_role]?.label}
                      </span>
                      <span className="text-[10px] text-slate-300 mx-1">•</span>
                      <span className="text-[10px] text-slate-400">{team.member_count} thành viên</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team Detail */}
        <div className="flex-1 overflow-y-auto p-8">
          {!activeTeam ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <Users size={48} className="text-slate-200 mb-4" />
              <p className="font-bold text-lg text-slate-500 mb-1">Chọn một nhóm để xem chi tiết</p>
              <p className="text-sm">hoặc tạo nhóm mới</p>
            </div>
          ) : teamLoading ? (
            <div className="flex justify-center pt-20">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              {/* Team header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-lg">
                    {activeTeam.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-800">{activeTeam.name}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {activeTeam.members?.length} / {activeTeam.max_members} thành viên
                      {activeTeam.my_role && (
                        <span className={`ml-2 font-bold ${ROLE_CONFIG[activeTeam.my_role]?.color}`}>
                          ({ROLE_CONFIG[activeTeam.my_role]?.label})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {['owner', 'admin'].includes(activeTeam.my_role) && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 font-bold rounded-xl text-sm transition"
                  >
                    <Mail size={14} /> Mời thành viên
                  </button>
                )}
              </div>

              {/* Members */}
              <section className="mb-8">
                <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                  Thành viên ({activeTeam.members?.length || 0})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeTeam.members?.map((m: any) => {
                    const rc = ROLE_CONFIG[m.role] || ROLE_CONFIG.member;
                    const RoleIcon = rc.icon;
                    const isMe = m.id === user?.id;
                    const canRemove = ['owner', 'admin'].includes(activeTeam.my_role) && m.role !== 'owner' && !isMe;
                    return (
                      <div key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition ${isMe ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url.startsWith('http') ? m.avatar_url : `http://localhost:3000${m.avatar_url}`} className="w-9 h-9 rounded-full object-cover border-2 border-white shadow" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white font-bold text-sm shadow shrink-0">
                            {m.name?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">
                            {m.name} {isMe && <span className="text-indigo-400 font-medium text-xs">(bạn)</span>}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{m.email}</p>
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${rc.bg}`}>
                          <RoleIcon size={10} className={rc.color} />
                          <span className={`text-[10px] font-bold ${rc.color}`}>{rc.label}</span>
                        </div>
                        {canRemove && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Designs */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">
                    Thiết kế của nhóm ({activeTeam.designs?.length || 0})
                  </h3>
                  {['owner', 'admin', 'member'].includes(activeTeam.my_role) && (
                    <div className="relative">
                      <button
                        onClick={() => setShowCreateDesignMenu(!showCreateDesignMenu)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition"
                      >
                        <Plus size={14} /> Tạo thiết kế mới
                      </button>

                      <AnimatePresence>
                        {showCreateDesignMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowCreateDesignMenu(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 flex flex-col gap-1"
                            >
                              <button onClick={() => handleCreateTeamDesign('presentation', 'canvas', 1920, 1080)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 rounded-lg text-left font-bold transition">
                                <Layout size={16} /> Presentation
                              </button>
                              <button onClick={() => handleCreateTeamDesign('document', 'doc', 800, null as any)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 rounded-lg text-left font-bold transition">
                                <FileText size={16} /> Document
                              </button>
                              <button onClick={() => handleCreateTeamDesign('video', 'canvas', 1920, 1080)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 rounded-lg text-left font-bold transition">
                                <Video size={16} /> Video
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                {activeTeam.designs?.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Layout size={28} className="mx-auto mb-2 text-slate-300" />
                    Chưa có thiết kế nào trong nhóm
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {activeTeam.designs?.map((d: any) => (
                      <Link key={d.id} to={`/design/${d.id}`}
                        className="bg-white rounded-2xl border border-slate-100 hover:shadow-lg hover:border-indigo-200 transition-all group overflow-hidden"
                      >
                        <div className="aspect-video bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden">
                          {d.thumbnail_url ? (
                            <img src={d.thumbnail_url} alt={d.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="text-slate-200">
                              {d.design_type === 'document' ? <FileText size={30} strokeWidth={1.5} /> : <Layout size={30} strokeWidth={1.5} />}
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="font-bold text-sm text-slate-800 truncate group-hover:text-indigo-600 transition">{d.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(d.updated_at).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-lg text-slate-800">Tạo nhóm mới</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tên nhóm *</label>
                  <input
                    autoFocus
                    type="text"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                    placeholder="VD: Nhóm Marketing..."
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Số thành viên tối đa</label>
                  <input
                    type="number"
                    value={newTeamMax}
                    onChange={e => setNewTeamMax(Number(e.target.value))}
                    min={2} max={100}
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold hover:from-indigo-600 hover:to-violet-600 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  <Check size={14} />
                  {actionLoading ? 'Đang tạo...' : 'Tạo nhóm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-lg text-slate-800">Mời thành viên</h3>
                <button onClick={() => setShowInviteModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email *</label>
                  <input
                    autoFocus type="email" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vai trò</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400 transition cursor-pointer">
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-sm">
                  Hủy
                </button>
                <button onClick={handleInvite} disabled={!inviteEmail.trim() || actionLoading}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold hover:from-emerald-600 hover:to-teal-600 transition shadow-md disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  <Mail size={14} />
                  {actionLoading ? 'Đang mời...' : 'Gửi lời mời'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
