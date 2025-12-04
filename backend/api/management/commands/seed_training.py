from django.core.management.base import BaseCommand

from api.models import Training


DEFAULT_TRAININGS = [
    {
        "training_name": "Jet A Fueling",
        "description": "Procedures and safety for Jet A fueling operations",
        "validity_period_days": 365,
        "aircraft_type": None,
    },
    {
        "training_name": "Avgas Fueling",
        "description": "Procedures and safety for Avgas fueling operations",
        "validity_period_days": 365,
        "aircraft_type": None,
    },
    {
        "training_name": "Fuel Spill Response",
        "description": "Emergency response and cleanup for fuel spills",
        "validity_period_days": 730,
        "aircraft_type": None,
    },
    {
        "training_name": "Tow and Marshalling",
        "description": "Aircraft towing, marshalling signals, and ramp safety",
        "validity_period_days": 730,
        "aircraft_type": None,
    },
    {
        "training_name": "HazMat Awareness",
        "description": "Hazardous materials awareness per airport/ramp operations",
        "validity_period_days": 365,
        "aircraft_type": None,
    },
]


class Command(BaseCommand):
    help = "Seed common training course definitions"

    def handle(self, *args, **options):
        created = 0
        for t in DEFAULT_TRAININGS:
            training, was_created = Training.objects.get_or_create(
                training_name=t["training_name"],
                defaults={
                    "description": t["description"],
                    "validity_period_days": t["validity_period_days"],
                    "aircraft_type": t["aircraft_type"],
                },
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created training: {training.training_name}"))
            else:
                # Update description/validity if changed
                updated = False
                for field in ("description", "validity_period_days", "aircraft_type"):
                    if getattr(training, field) != t[field]:
                        setattr(training, field, t[field])
                        updated = True
                if updated:
                    training.save()
                    self.stdout.write(self.style.WARNING(f"Updated training: {training.training_name}"))
                else:
                    self.stdout.write(self.style.WARNING(f"Training exists: {training.training_name}"))

        self.stdout.write(self.style.SUCCESS(f"Training seeding complete. Created: {created}, total: {Training.objects.count()}"))
