import React from 'react';
import { KeyValuePair } from '@/types';
import { generateId } from '@/utils';

interface Props {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export const KeyValueEditor: React.FC<Props> = ({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value'
}) => {
  const addItem = () => {
    onChange([...items, { id: generateId(), key: '', value: '', enabled: true }]);
  };

  const updateItem = (id: string, field: keyof KeyValuePair, value: any) => {
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  return (
    <div>
      <table className="kvp-table">
        <thead>
          <tr>
            <th className="col-enabled">启用</th>
            <th>{keyPlaceholder}</th>
            <th>{valuePlaceholder}</th>
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted" style={{ padding: '16px' }}>
                暂无数据，点击下方按钮添加
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.id}>
              <td className="col-enabled text-center">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={item.enabled}
                  onChange={(e) => updateItem(item.id, 'enabled', e.target.checked)}
                />
              </td>
              <td style={{ minWidth: 150 }}>
                <input
                  type="text"
                  value={item.key}
                  placeholder={keyPlaceholder}
                  onChange={(e) => updateItem(item.id, 'key', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={item.value}
                  placeholder={valuePlaceholder}
                  onChange={(e) => updateItem(item.id, 'value', e.target.value)}
                />
              </td>
              <td className="col-actions text-center">
                <button className="btn btn-sm btn-icon hover-danger" onClick={() => removeItem(item.id)} title="删除">
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm mt-2" onClick={addItem}>
        + 添加
      </button>
    </div>
  );
};
