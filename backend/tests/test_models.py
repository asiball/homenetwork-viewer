"""Numeric boundary tests for the input models (issue #90, item 4).

The percentage / port constraints are what keep a corrupt or hand-edited
catalog from reaching the UI bars and tables (issue #88). Pin the exact
accept / reject edges here so a future loosening of the bounds is caught.
"""

import pytest
from pydantic import ValidationError

from app.models import Drive, Metrics, Service


@pytest.mark.parametrize("pct", [0, 50, 100])
def test_metrics_accepts_pct_in_range(pct):
    m = Metrics(cpu_pct=pct, mem_pct=pct)
    assert m.cpu_pct == pct
    assert m.mem_pct == pct


@pytest.mark.parametrize("pct", [-1, 101, 150])
def test_metrics_rejects_pct_out_of_range(pct):
    with pytest.raises(ValidationError):
        Metrics(cpu_pct=pct)
    with pytest.raises(ValidationError):
        Metrics(mem_pct=pct)


@pytest.mark.parametrize("port", [1, 80, 65535])
def test_service_accepts_port_in_range(port):
    assert Service(port=port).port == port


@pytest.mark.parametrize("port", [0, -1, 65536, 99999])
def test_service_rejects_port_out_of_range(port):
    with pytest.raises(ValidationError):
        Service(port=port)


@pytest.mark.parametrize("pct", [0, 100])
def test_drive_accepts_pct_in_range(pct):
    assert Drive(nm="sda", pct=pct).pct == pct


@pytest.mark.parametrize("pct", [-1, 101])
def test_drive_rejects_pct_out_of_range(pct):
    with pytest.raises(ValidationError):
        Drive(nm="sda", pct=pct)
