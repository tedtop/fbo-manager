from datetime import timedelta
import random
from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import User, Aircraft, Flight, ParkingLocation

# Sample Data
AIRCRAFT_DATA = [
    {"tail_number": "N12345", "type": "Citation X", "icao": "CGTX"},
    {"tail_number": "N999WW", "type": "Boeing 737", "icao": "B737"},
    {"tail_number": "N555HA", "type": "Gulfstream G650", "icao": "GLF6"},
    {"tail_number": "N777AB", "type": "Pilatus PC-12", "icao": "PC12"},
    {"tail_number": "N10101", "type": "Cessna 172", "icao": "C172"},
    {"tail_number": "N888EX", "type": "Falcon 7X", "icao": "FA7X"},
    {"tail_number": "N404NF", "type": "Learjet 45", "icao": "LJ45"},
]

AIRPORTS = ["SEA", "PDX", "LAX", "SFO", "DEN", "SLC", "JFK", "MIA"]
SERVICES = ["fuel", "catering", "transport", "cleaning", "lavatory"]

class Command(BaseCommand):
    help = "Seed database with sample flights and aircraft"

    def handle(self, *args, **options):
        self.stdout.write("Seeding flights and aircraft...")

        # Ensure Admin User
        admin_user = User.objects.filter(is_superuser=True).first()
        if not admin_user:
            admin_user = User.objects.create_superuser("admin", "admin@example.com", "admin")
            self.stdout.write("Created admin user")

        # Create Parking Locations if none
        if ParkingLocation.objects.count() == 0:
            for i in range(1, 6):
                ParkingLocation.objects.create(
                    location_code=f"RAMP-{i}",
                    display_order=i,
                    description=f"Ramp Spot {i}"
                )
        locations = list(ParkingLocation.objects.all())

        # Create/Update Aircraft
        aircraft_objs = []
        for ac in AIRCRAFT_DATA:
            obj, created = Aircraft.objects.get_or_create(
                tail_number=ac["tail_number"],
                defaults={
                    "aircraft_type_display": ac["type"],
                    "aircraft_type_icao": ac["icao"]
                }
            )
            if not created:
                obj.aircraft_type_display = ac["type"]
                obj.save()
            aircraft_objs.append(obj)
            if created:
                self.stdout.write(f"Created aircraft {ac['tail_number']}")

        # Create Flights
        now = timezone.now()
        # Clear existing scheduled flights to avoid clutter? No, append.
        
        # 1. Arrival in 1 hour (N12345)
        self.create_flight(
            aircraft=aircraft_objs[0],
            flight_type="arrival",
            time_offset_hours=1,
            user=admin_user,
            location=random.choice(locations)
        )

        # 2. Departure in 3 hours (N999WW)
        self.create_flight(
            aircraft=aircraft_objs[1],
            flight_type="departure",
            time_offset_hours=3,
            user=admin_user,
            location=random.choice(locations)
        )

        # 3. Quick Turn 2 days ago (completed) (N555HA)
        self.create_flight(
            aircraft=aircraft_objs[2],
            flight_type="quick_turn",
            time_offset_hours=-48,
            user=admin_user,
            status="departed"
        )

        # 4. Arrival tomorrow (N777AB)
        self.create_flight(
            aircraft=aircraft_objs[3],
            flight_type="arrival",
            time_offset_hours=25,
            user=admin_user
        )

        # 5. Departure now (N10101)
        self.create_flight(
            aircraft=aircraft_objs[4],
            flight_type="departure",
            time_offset_hours=0,
            user=admin_user,
            status="departed"
        )
        
        # 6. Random others
        for i in range(5):
            ac = random.choice(aircraft_objs)
            hours = random.randint(-24, 48)
            ftype = random.choice(["arrival", "departure", "quick_turn"])
            self.create_flight(ac, ftype, hours, admin_user)

        self.stdout.write(self.style.SUCCESS("Successfully seeded flights"))

    def create_flight(self, aircraft, flight_type, time_offset_hours, user, status="scheduled", location=None):
        base_time = timezone.now() + timedelta(hours=time_offset_hours)
        
        arrival_time = None
        departure_time = None
        
        if flight_type == "arrival":
            arrival_time = base_time
            # Auto-set departure for logic (even if just arrival, DB requires departure_time usually or we fake it)
            # Flight model says departure_time is NOT NULL.
            # Usually arrival flights have a departure time set to future or 'unknown'? 
            # Frontend sets it to +45 mins.
            departure_time = base_time + timedelta(minutes=45)
            origin = random.choice(AIRPORTS)
            destination = "MSO"
            
        elif flight_type == "departure":
            departure_time = base_time
            arrival_time = None # DB allows null arrival
            origin = "MSO"
            destination = random.choice(AIRPORTS)
            
        elif flight_type == "quick_turn":
            arrival_time = base_time
            departure_time = base_time + timedelta(minutes=60)
            origin = random.choice(AIRPORTS)
            destination = random.choice(AIRPORTS)

        Flight.objects.create(
            aircraft=aircraft,
            flight_status=status,
            arrival_time=arrival_time,
            departure_time=departure_time,
            origin=origin,
            destination=destination,
            services=random.sample(SERVICES, k=random.randint(0, 3)),
            location=location,
            created_by=user,
            created_by_source="line-department"
        )
