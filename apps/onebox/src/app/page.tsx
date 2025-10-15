import { ChatWindow } from '../components/ChatWindow';
import { GovernanceCockpit } from '../components/GovernanceCockpit';
import styles from './page.module.css';

export default function Page() {
  return (
    <div className={styles.pageLayout}>
      <div className={styles.chatPane}>
        <ChatWindow />
      </div>
      <aside className={styles.cockpitPane}>
        <GovernanceCockpit />
      </aside>
    </div>
  );
}
