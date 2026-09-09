import TrainTogetherRoomBanner from "@/components/TrainTogetherRoomBanner";
import WorkoutCompletionGuard from "@/components/WorkoutCompletionGuard";
import LiveWorkoutMenu from "@/components/LiveWorkoutMenu";
import styles from "./sessionActions.module.css";

export default function SessionLayout({children}:{children:React.ReactNode}){
 return <div className={styles.sessionShell}><WorkoutCompletionGuard/><TrainTogetherRoomBanner/><LiveWorkoutMenu/>{children}</div>;
}
