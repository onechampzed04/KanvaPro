// frontend/src/components/editor/CollaboratorAvatars.tsx
// Hiển thị avatars của những người đang cùng edit design

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users } from 'lucide-react';
import type { CollaboratorInfo } from '../../hooks/useCollaboration';

interface CollaboratorAvatarsProps {
  users: CollaboratorInfo[];
  currentUserId?: string;
  isConnected: boolean;
}

// Lấy 2 chữ cái đầu của tên để hiển thị trong avatar
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export default function CollaboratorAvatars({
  users = [],
  currentUserId,
  isConnected,
}: CollaboratorAvatarsProps) {
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  // Lọc bỏ user hiện tại để không hiện avatar của chính mình
  const others = users.filter(u => u.userId !== currentUserId);

  const MAX_VISIBLE = 4;
  const visibleUsers = others.slice(0, MAX_VISIBLE);
  const overflowCount = Math.max(0, others.length - MAX_VISIBLE);

  if (!isConnected && others.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Connection dot */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
            isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'
          }`}
        />
        {others.length > 0 && (
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
            {others.length} editing
          </span>
        )}
      </div>

      {/* Avatar stack */}
      <div className="flex items-center" style={{ marginLeft: '-4px' }}>
        <AnimatePresence mode="popLayout">
          {visibleUsers.map((user, idx) => (
            <motion.div
              key={user.socketId}
              initial={{ opacity: 0, scale: 0.5, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.5, x: -10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25, delay: idx * 0.05 }}
              className="relative"
              style={{ zIndex: MAX_VISIBLE - idx, marginLeft: idx === 0 ? 0 : '-8px' }}
              onMouseEnter={() => setHoveredUserId(user.userId)}
              onMouseLeave={() => setHoveredUserId(null)}
            >
              {/* Avatar circle */}
              <div
                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-md cursor-default select-none"
                style={{ backgroundColor: user.avatarColor }}
                title={user.name}
              >
                {getInitials(user.name)}
              </div>

              {/* Tooltip */}
              <AnimatePresence>
                {hoveredUserId === user.userId && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-9 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
                  >
                    <div className="bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap">
                      <div>{user.name}</div>
                      <div className="text-slate-400 font-normal text-[10px]">{user.email}</div>
                      {/* Cái mũi tên nhỏ */}
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Overflow badge */}
        {overflowCount > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-7 h-7 rounded-full border-2 border-white bg-slate-600 flex items-center justify-center text-white text-[9px] font-black shadow-md"
            style={{ zIndex: 0, marginLeft: '-8px' }}
            title={`${overflowCount} more users`}
          >
            +{overflowCount}
          </motion.div>
        )}
      </div>

      {/* "No one else" indicator khi chỉ có 1 mình */}
      {isConnected && others.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1 text-[10px] text-slate-400 font-medium"
        >
          <Users size={11} />
          <span className="hidden sm:block">Only you</span>
        </motion.div>
      )}
    </div>
  );
}
