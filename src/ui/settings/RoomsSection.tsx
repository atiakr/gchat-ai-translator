import { useId } from 'react';
import { t } from '../../i18n/t';
import type { RoomSettings } from '../../settings/schema';
import { roomInstructions } from '../../settings/storage';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Select } from '../common/Select';
import { Toggle } from '../common/Toggle';
import { roomOutgoingOptions } from './options';
import { RoomInstructionsField } from './RoomInstructionsField';

export interface RoomsSectionProps {
  rooms: RoomSettings[];
  updateRoom: (roomId: string, patch: Partial<Omit<RoomSettings, 'roomId'>>) => Promise<boolean>;
  deleteRoom: (roomId: string) => Promise<void>;
}

export function RoomsSection({ rooms, updateRoom, deleteRoom }: RoomsSectionProps) {
  const ids = useId();
  const outgoing = roomOutgoingOptions();
  return (
    <Card title={t('options_sectionRooms')} description={t('options_sectionRoomsHelp')}>
      {rooms.length === 0 ? (
        <p className="gat-muted">{t('options_roomsEmpty')}</p>
      ) : (
        <ul className="gat-list">
          {rooms.map((room, index) => (
            <li key={room.roomId} className="gat-list__item">
              <div className="gat-row gat-row--between">
                <span className="gat-list__title" title={room.roomId}>
                  {room.name || room.roomId}
                </span>
                <Button variant="danger" size="sm" onClick={() => deleteRoom(room.roomId)}>
                  {t('common_delete')}
                </Button>
              </div>
              <div className="gat-row gat-row--between gat-row--wrap">
                <Toggle
                  label={t('options_roomIncomingOff')}
                  checked={room.incomingDisabled}
                  onChange={(incomingDisabled) => updateRoom(room.roomId, { incomingDisabled })}
                />
                <div className="gat-row">
                  <label className="gat-muted" htmlFor={`${ids}-out-${index}`}>
                    {t('options_roomOutgoingLang')}
                  </label>
                  <Select
                    id={`${ids}-out-${index}`}
                    value={room.outgoingLang ?? ''}
                    options={outgoing}
                    onChange={(v) => updateRoom(room.roomId, { outgoingLang: v || undefined })}
                  />
                </div>
              </div>
              <RoomInstructionsField
                value={roomInstructions(room)}
                onSave={(instructions) => updateRoom(room.roomId, { instructions })}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
