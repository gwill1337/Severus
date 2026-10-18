import type { User } from "../../types/Chat";

interface Props {
  title: string;
  users: User[];
  activeUserId: string | null;
  onSelect: (id: string) => void;
}

export function UserList({ title, users, activeUserId, onSelect }: Props) {
  return (
    <div className="w-72 h-full border border-white/10 rounded-l-lg bg-dungeon-surface/60 backdrop-blur overflow-y-auto shrink-0 p-2">
      <div className="text-[10px] text-gray-500 uppercase mb-4 px-2 tracking-widest">{title}</div>

      {users.map((u) => (
        <div
          key={u.id}
          onClick={() => onSelect(u.id)}
          className={`text-xs font-mono p-2 mb-1 rounded cursor-pointer transition-colors ${
            activeUserId === u.id ? "bg-slytherin/40 text-potion-glow" : "hover:bg-white/5"
          }`}
        >
          {u.username}
        </div>
      ))}
    </div>
  );
}