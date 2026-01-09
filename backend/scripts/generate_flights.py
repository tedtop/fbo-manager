import random
from datetime import datetime, timedelta
from django.utils import timezone
from api.models import Flight, Aircraft, User

# Constants
AIRCRAFT_TYPES = {
    'C172': 'Cessna 172 Skyhawk',
    'C182': 'Cessna 182 Skylane',
    'SR22': 'Cirrus SR22',
    'G650': 'Gulfstream G650',
    'CL35': 'Challenger 350',
    'C56X': 'Cessna Citation Excel',
    'GLF5': 'Gulfstream V',
    'PC12': 'Pilatus PC-12',
    'BE20': 'Beechcraft King Air 200'
}

SERVICES_OPTS = ['Fuel', 'Lavatory', 'Catering', 'GPU', 'Water', 'Vacuum', 'Oxygen', 'Ice']
CITIES = ['KSEA', 'KPDX', 'KBFI', 'KSFO', 'KLAX', 'KJFK', 'KORD', 'KDEN', 'KBOS', 'KMIA']

def generate_tail_number():
    digits = random.randint(100, 999)
    suffix = ""
    for _ in range(2):
        suffix += chr(random.randint(65, 90))
    return f"N{digits}{suffix}"

def run():
    print("Starting flight generation...")
    
    # 1. Cleaner: Delete existing flights to avoid clutter
    print("Clearing existing flights...")
    Flight.objects.all().delete()
    
    # Ensure admin user
    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        if User.objects.exists():
             admin_user = User.objects.first()
        else:
             print("No users found. Creating temp admin...")
             admin_user = User.objects.create_superuser('admin_gen', 'admin@gen.com', 'pass')

    # 2. Calculate Start of Current Week (Sunday)
    today = timezone.localtime(timezone.now()).date()
    # today.weekday() returns 0=Monday, 6=Sunday. 
    # We want 0=Sunday.
    # Python weekday: Mon=0, Tue=1, ... Sun=6.
    # To get last Sunday:
    # If today is Sunday (6), offset is 0.
    # If today is Monday (0), offset is 1. (Sunday was yesterday)
    # If today is Tuesday (1), offset is 2.
    # logic: (today.weekday() + 1) % 7 is days since sunday
    days_since_sunday = (today.weekday() + 1) % 7
    start_of_week = today - timedelta(days=days_since_sunday)
    
    print(f"Generating week starting Sunday {start_of_week}")

    flights_created = 0
    
    # Generate for 7 days (Sun -> Sat)
    for day_idx in range(7):
        current_date = start_of_week + timedelta(days=day_idx)
        print(f"Generating for {current_date}")
        
        # 1 to 3 flights per day
        num_flights = random.randint(2, 4) # Slightly more to ensure visibility
        
        for _ in range(num_flights):
            icao = random.choice(list(AIRCRAFT_TYPES.keys()))
            tail = generate_tail_number()
            
            aircraft, _ = Aircraft.objects.get_or_create(
                tail_number=tail,
                defaults={
                    'aircraft_type_icao': icao,
                    'aircraft_type_display': AIRCRAFT_TYPES[icao]
                }
            )
            
            # Times: Spread them out
            hour = random.randint(7, 19) # 7 AM to 7 PM
            minute = random.choice([0, 15, 30, 45])
            
            base_time = datetime.combine(current_date, datetime.min.time())
            base_time = base_time.replace(hour=hour, minute=minute)
            base_time = timezone.make_aware(base_time)
            
            f_type = random.choice(['arrival', 'departure', 'quick_turn'])
            
            arrival_time = None
            departure_time = None
            status = 'scheduled'
            
            # Simple past logic
            is_past = base_time < timezone.now()
            
            if f_type == 'arrival':
                arrival_time = base_time
                departure_time = base_time + timedelta(minutes=45) 
                if is_past: status = 'arrived'
                    
            elif f_type == 'departure':
                departure_time = base_time
                if is_past: status = 'departed'
                    
            else: # QuickTurn
                arrival_time = base_time
                departure_time = base_time + timedelta(minutes=random.choice([30, 60]))
                if is_past:
                    if timezone.now() > departure_time: status = 'departed'
                    elif timezone.now() > arrival_time: status = 'arrived'

            num_services = random.randint(1, 4)
            flight_services = random.sample(SERVICES_OPTS, num_services)
            
            origin = random.choice(CITIES) if f_type in ['arrival', 'quick_turn'] else 'KMSO'
            destination = random.choice(CITIES) if f_type in ['departure', 'quick_turn'] else 'KMSO'
            
            Flight.objects.create(
                aircraft=aircraft,
                arrival_time=arrival_time,
                departure_time=departure_time,
                flight_status=status,
                origin=origin,
                destination=destination,
                services=flight_services,
                created_by=admin_user,
                passenger_count=random.randint(1, 8),
                created_by_source='line-department'
            )
            flights_created += 1
            
    print(f"DONE: Created {flights_created} flights.")

run()
