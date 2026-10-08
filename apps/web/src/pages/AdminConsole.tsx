// The administrator's home: overview charts, the activity log, every account's saved runs, and
// user management. Only offered to an admin; the API checks the role on every call.
import { useState } from 'react';
import { Segmented } from '../components/ui';
import { AdminPage } from './AdminPage';
import { AuditPage } from './AuditPage';
import { ActivityPanel } from './admin/ActivityPanel';
import { OverviewPanel } from './admin/OverviewPanel';

type Section = 'overview' | 'activity' | 'runs' | 'users';

export function AdminConsole() {
  const [section, setSection] = useState<Section>('overview');
  return (
    <div className="space-y-5">
      <div className="max-w-xl">
        <Segmented<Section>
          label="Admin sections"
          value={section}
          onChange={setSection}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'activity', label: 'Activity log' },
            { value: 'runs', label: 'All runs' },
            { value: 'users', label: 'Users' },
          ]}
        />
      </div>
      {section === 'overview' && <OverviewPanel />}
      {section === 'activity' && <ActivityPanel />}
      {section === 'runs' && <AuditPage />}
      {section === 'users' && <AdminPage />}
    </div>
  );
}
