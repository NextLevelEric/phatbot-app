import TrainTogetherRoomBanner from "@/components/TrainTogetherRoomBanner";
import WorkoutCompletionGuard from "@/components/WorkoutCompletionGuard";

export default function SessionLayout({children}:{children:React.ReactNode}){
 return <><WorkoutCompletionGuard/><TrainTogetherRoomBanner/>{children}</>;
}
