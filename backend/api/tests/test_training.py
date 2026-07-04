import pytest
from datetime import date, timedelta
from django.urls import reverse
from rest_framework import status

from api.models import User, Fueler, Training, FuelerTraining, FuelerTrainingHistory


@pytest.mark.django_db
def test_fueler_training_auto_expiry_on_create(api_client):
    # Create admin user and authenticate
    admin = User.objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="pass",
        role="admin",
        is_staff=True,
    )
    api_client.force_authenticate(user=admin)

    # Create fueler & training
    user = User.objects.create_user(username="f1", email="f1@example.com")
    fueler = Fueler.objects.create(user=user, fueler_name="Fueler One")
    training = Training.objects.create(
        training_name="SPCC",
        validity_period_days=365,
    )

    # Create certification without explicit expiry_date
    url = reverse("fueler-certifications-list")
    completed = date.today() - timedelta(days=1)
    payload = {
        "fueler": fueler.id,
        "training": training.id,
        "completed_date": completed.isoformat(),
    }

    response = api_client.post(url, payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED

    cert = FuelerTraining.objects.get(id=response.data["id"]) if isinstance(response.data, dict) else FuelerTraining.objects.first()
    assert cert.expiry_date == completed + timedelta(days=365)


@pytest.mark.django_db
def test_complete_action_creates_history_and_upserts(api_client):
    admin = User.objects.create_user(
        username="admin2@example.com",
        email="admin2@example.com",
        password="pass",
        role="admin",
        is_staff=True,
    )
    api_client.force_authenticate(user=admin)

    user = User.objects.create_user(username="f2", email="f2@example.com")
    fueler = Fueler.objects.create(user=user, fueler_name="Fueler Two")
    training = Training.objects.create(training_name="Wing Walk", validity_period_days=30)

    url = reverse("fueler-certifications-complete")

    # First completion
    response = api_client.post(
        url,
        {"fueler": fueler.id, "training": training.id, "completed_date": date.today().isoformat(), "notes": "Initial"},
        format="json",
    )
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
    assert FuelerTraining.objects.filter(fueler=fueler, training=training).count() == 1
    assert FuelerTrainingHistory.objects.filter(fueler=fueler, training=training).count() == 1

    # Second completion should upsert current and add another history row
    response = api_client.post(
        url,
        {"fueler": fueler.id, "training": training.id, "completed_date": date.today().isoformat(), "notes": "Recurrent"},
        format="json",
    )
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
    assert FuelerTraining.objects.filter(fueler=fueler, training=training).count() == 1
    assert FuelerTrainingHistory.objects.filter(fueler=fueler, training=training).count() == 2


@pytest.mark.django_db
def test_calendar_endpoint_returns_events(api_client):
    admin = User.objects.create_user(
        username="admin3@example.com",
        email="admin3@example.com",
        password="pass",
        role="admin",
        is_staff=True,
    )
    api_client.force_authenticate(user=admin)

    user = User.objects.create_user(username="f3", email="f3@example.com")
    fueler = Fueler.objects.create(user=user, fueler_name="Fueler Three")
    training = Training.objects.create(training_name="Deicing", validity_period_days=10)

    # Create history completion and a current certification that expires soon
    FuelerTrainingHistory.objects.create(
        fueler=fueler,
        training=training,
        completed_date=date.today() - timedelta(days=2),
        expiry_date=date.today() + timedelta(days=8),
        certified_by=admin,
    )
    FuelerTraining.objects.create(
        fueler=fueler,
        training=training,
        completed_date=date.today() - timedelta(days=2),
        expiry_date=date.today() + timedelta(days=8),
        certified_by=admin,
    )

    url = reverse("fueler-certifications-calendar")
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    # Expect at least one completed and one expiry event
    types = {e.get("type") for e in data}
    assert "completed" in types
    assert "expiry" in types
