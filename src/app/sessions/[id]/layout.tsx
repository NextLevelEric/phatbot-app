import TrainTogetherRoomBanner from "@/components/TrainTogetherRoomBanner";
import WorkoutCompletionGuard from "@/components/WorkoutCompletionGuard";
import styles from "./sessionActions.module.css";

export default function SessionLayout({children}:{children:React.ReactNode}){
 return <div className={styles.sessionShell}><WorkoutCompletionGuard/><TrainTogetherRoomBanner/>{children}</div>;
}
