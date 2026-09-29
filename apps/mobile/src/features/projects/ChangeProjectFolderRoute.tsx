import type { StaticScreenProps } from "@react-navigation/native";
import { ChangeProjectFolderScreen } from "./AddProjectScreen";

type ChangeProjectFolderRouteParams = {
  readonly environmentId?: string | string[];
  readonly projectId?: string | string[];
};

export function ChangeProjectFolderRoute({
  route,
}: StaticScreenProps<ChangeProjectFolderRouteParams | undefined>) {
  return <ChangeProjectFolderScreen {...(route.params ?? {})} />;
}
