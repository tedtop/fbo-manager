from django.core.management.base import BaseCommand
from django.conf import settings

from api.models import User, Fueler


DEFAULT_FUELERS = [
    {
        "username": "fueler1",
        "email": "fueler1@example.com",
        "first_name": "Fueler",
        "last_name": "One",
        "employee_id": "F001",
        "handheld_name": "FUELER-1",
    },
    {
        "username": "fueler2",
        "email": "fueler2@example.com",
        "first_name": "Fueler",
        "last_name": "Two",
        "employee_id": "F002",
        "handheld_name": "FUELER-2",
    },
    {
        "username": "fueler3",
        "email": "fueler3@example.com",
        "first_name": "Fueler",
        "last_name": "Three",
        "employee_id": "F003",
        "handheld_name": "FUELER-3",
    },
    {
        "username": "fueler4",
        "email": "fueler4@example.com",
        "first_name": "Fueler",
        "last_name": "Four",
        "employee_id": "F004",
        "handheld_name": "FUELER-4",
    },
]

ADMIN_USER = {
    "username": "fueleradmin",
    "email": "fueleradmin@example.com",
    "first_name": "Fueler",
    "last_name": "Admin",
    "employee_id": "F000",
}


class Command(BaseCommand):
    help = "Create 4 demo fueler accounts with Fueler profiles"

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            dest="password",
            default="fueler123",
            help="Default password to set for created fueler users",
        )

    def handle(self, *args, **options):
        password = options["password"]

        created_count = 0
        for f in DEFAULT_FUELERS:
            user, created = User.objects.get_or_create(
                username=f["username"],
                defaults={
                    "email": f["email"],
                    "first_name": f["first_name"],
                    "last_name": f["last_name"],
                    "role": "line",
                    "employee_id": f["employee_id"],
                    "is_active_fueler": True,
                    "is_active": True,
                },
            )

            if created:
                user.set_password(password)
                user.save()
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created user: {user.username}"))
            else:
                self.stdout.write(self.style.WARNING(f"User exists: {user.username}"))

            fueler, f_created = Fueler.objects.get_or_create(
                user=user,
                defaults={
                    "fueler_name": f"{f['first_name']} {f['last_name']}",
                    "handheld_name": f["handheld_name"],
                    "status": "active",
                },
            )

            if f_created:
                self.stdout.write(self.style.SUCCESS(f"Created fueler profile: {fueler.fueler_name}"))
            else:
                # Ensure profile reflects active fueler
                fueler.status = "active"
                fueler.handheld_name = f["handheld_name"]
                fueler.save(update_fields=["status", "handheld_name"])
                self.stdout.write(self.style.WARNING(f"Updated fueler profile: {fueler.fueler_name}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Fueler seeding complete. Users created: {created_count}. Default password: '{password}'"
            )
        )

        # Create or update admin user
        admin_user, admin_created = User.objects.get_or_create(
            username=ADMIN_USER["username"],
            defaults={
                "email": ADMIN_USER["email"],
                "first_name": ADMIN_USER["first_name"],
                "last_name": ADMIN_USER["last_name"],
                "role": "admin",
                "employee_id": ADMIN_USER["employee_id"],
                "is_active_fueler": True,
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if admin_created:
            admin_user.set_password(password)
            admin_user.save()
            self.stdout.write(self.style.SUCCESS("Created admin user: fueleradmin"))
        else:
            # Ensure admin flags and role
            admin_user.role = "admin"
            admin_user.is_staff = True
            admin_user.is_superuser = True
            admin_user.is_active_fueler = True
            admin_user.save(update_fields=["role", "is_staff", "is_superuser", "is_active_fueler"])
            self.stdout.write(self.style.WARNING("Updated admin user: fueleradmin"))
