interface Props {
  roomName: string;
  onRoomNameChange: (value: string) => void;
  roomIdToJoin: string;
  onRoomIdChange: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}

const inputClass =
  "bg-black/40 border border-white/10 rounded px-3 py-1 text-xs outline-none focus:border-potion-glow/50";
const buttonClass =
  "text-[10px] uppercase tracking-tighter text-left hover:text-potion-glow";

export function RoomControls({
  roomName,
  onRoomNameChange,
  roomIdToJoin,
  onRoomIdChange,
  onCreate,
  onJoin,
}: Props) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col gap-2">
        <input
          className={inputClass}
          value={roomName}
          onChange={(e) => onRoomNameChange(e.target.value)}
          placeholder="Room's name"
        />
        <button className={buttonClass} onClick={onCreate}>
          [ Create room ]
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <input
          className={inputClass}
          value={roomIdToJoin}
          onChange={(e) => onRoomIdChange(e.target.value)}
          placeholder="Room's ID/Name"
        />
        <button className={buttonClass} onClick={onJoin}>
          [ Join room ]
        </button>
      </div>
    </div>
  );
}