// Shared view chrome for the detail / edit screens: the footer line and the
// "device not found" fallback, so the two screens can't drift apart.

import { Link, useNavigate } from "react-router-dom";
import type { Device } from "../types";
import { Shell } from "./Shell";
import { RefreshControls } from "./RefreshControls";
import { APP_VERSION } from "../version";

// Footer used by the detail and edit screens (the home footer is richer and
// stays bespoke). One place owns the version string and layout.
export function ViewFooter({ view, tail }: { view: string; tail: string }) {
  return (
    <>
      <span>
        view <b>{view}</b>
      </span>
      <span className="right">homenet {APP_VERSION} · {tail}</span>
    </>
  );
}

// Shown when a /d/:id or /d/:id/edit route points at a device that no longer
// exists. Keeps the NOC shell (list + nav) so the user can recover.
export function DeviceNotFound({ devices, id }: { devices: Device[]; id: string }) {
  const navigate = useNavigate();
  return (
    <Shell
      devices={devices}
      onSelect={(did) => navigate(`/d/${did}`)}
      crumbs={
        <>
          <Link className="d-back" to="/">
            ← map
          </Link>{" "}
          &nbsp;<span>not found</span>
        </>
      }
      right={<RefreshControls />}
      footer={<ViewFooter view="not found" tail={id} />}
    >
      <div className="d-main">
        <div className="center-screen">
          <div className="big">device not found</div>
          <div>id · {id}</div>
          <Link className="f-btn" to="/">
            ← back to map
          </Link>
        </div>
      </div>
    </Shell>
  );
}
