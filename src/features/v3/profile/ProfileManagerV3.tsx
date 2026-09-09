import { useRef, useState } from "react";
import type { PlannerStateV3 } from "../../../planner-v3/types";
import type { UserDigitalTwinV48 } from "../../../account/digitalTwinV48";
import { deleteProfileV3, importProfileBackupV55, listProfilesV3, saveProfileV3, serializeProfileBackupV55, type StoredDeckGoalV3, type StoredProfileV3, type StoredSpendProfileV3 } from "../../../storage/profileStorageV3";
import { downloadTextFileV55 } from "../../../utils/downloadV55";

export function ProfileManagerV3({ locale, state, activeDeckIds, deckGoal, spendProfile, digitalTwin, onLoad, onClose }: {
  locale: "ko" | "en";
  state: PlannerStateV3;
  activeDeckIds: string[];
  deckGoal: StoredDeckGoalV3;
  spendProfile: StoredSpendProfileV3;
  digitalTwin?: UserDigitalTwinV48;
  onLoad: (profile: StoredProfileV3) => void;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState(() => listProfilesV3());
  const [name, setName] = useState("");
  const [backupNotice, setBackupNotice] = useState<string>();
  const backupInputRef = useRef<HTMLInputElement>(null);
  const save = () => {
    saveProfileV3({ name, state, activeDeckIds, deckGoal, spendProfile, digitalTwin });
    setProfiles(listProfilesV3());
    setName("");
  };
  const exportBackup = () => {
    downloadTextFileV55(`dicetree-profiles-${new Date().toISOString().slice(0, 10)}.json`, serializeProfileBackupV55());
    setBackupNotice(locale === "ko" ? "프로필 백업 파일을 저장했습니다. 다른 기기에서 이 파일을 불러오면 됩니다." : "Profile backup saved. Import this file on another device.");
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = importProfileBackupV55(await file.text());
      setProfiles(result.profiles);
      setBackupNotice(locale === "ko"
        ? `${result.imported}개 추가 · ${result.updated}개 업데이트 · ${result.skipped}개는 현재 사본 유지`
        : `${result.imported} added · ${result.updated} updated · ${result.skipped} kept locally`);
    } catch {
      setBackupNotice(locale === "ko" ? "diceify 프로필 백업 파일을 읽지 못했습니다." : "This is not a valid diceify profile backup.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };
  return <aside className="v47-profile-panel" data-testid="v47-profile-panel">
    <header><div><small>{locale === "ko" ? "브라우저 로컬 저장" : "LOCAL BROWSER STORAGE"}</small><h2>{locale === "ko" ? "내 프로필" : "My Profiles"}</h2></div><button type="button" onClick={onClose} aria-label={locale === "ko" ? "닫기" : "Close"}>×</button></header>
    <p>{locale === "ko" ? "주사위 레벨, 보유 재화, 트리, 덱과 선호 역할을 한 세트로 저장합니다." : "Stores levels, resources, tree, deck, and role preferences as one local profile."}</p>
    <div className="v47-profile-create"><input aria-label={locale === "ko" ? "프로필 이름" : "Profile name"} value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "ko" ? "예: 본계정" : "Example: Main account"} /><button type="button" onClick={save} disabled={!name.trim()}>{locale === "ko" ? "현재 상태 저장" : "Save current"}</button></div>
    <div className="v55-profile-backup" aria-label={locale === "ko" ? "프로필 백업" : "Profile backup"}>
      <div><strong>{locale === "ko" ? "기기 간 백업" : "Portable backup"}</strong><small>{locale === "ko" ? "로그인이나 외부 서버 없이 JSON 파일로 다른 기기에 옮깁니다." : "Move profiles to another device with a JSON file, without login or an external server."}</small></div>
      <div><button type="button" onClick={exportBackup}>{locale === "ko" ? "백업 내보내기" : "Export backup"}</button><button type="button" onClick={() => backupInputRef.current?.click()}>{locale === "ko" ? "백업 불러오기" : "Import backup"}</button></div>
      <input ref={backupInputRef} data-testid="v55-profile-backup-input" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0])} />
      {backupNotice && <p role="status">{backupNotice}</p>}
    </div>
    <div className="v47-profile-list">{profiles.length ? profiles.map((profile) => <article key={profile.id}>
      <div><strong>{profile.name}</strong><small>{new Date(profile.modifiedAt).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")} · {profile.activeDeckIds.length}{locale === "ko" ? "개 덱" : " dice"}</small></div>
      <button type="button" onClick={() => onLoad(profile)}>{locale === "ko" ? "불러오기" : "Load"}</button>
      <button type="button" onClick={() => { deleteProfileV3(profile.id); setProfiles(listProfilesV3()); }}>{locale === "ko" ? "삭제" : "Delete"}</button>
    </article>) : <p>{locale === "ko" ? "저장된 프로필이 없습니다." : "No saved profiles."}</p>}</div>
    <footer>{locale === "ko" ? "기본 저장은 이 브라우저에만 남습니다. 브라우저 데이터를 지우기 전에는 백업 파일을 내보내세요." : "Profiles remain in this browser by default. Export a backup before clearing browser data."}</footer>
  </aside>;
}
