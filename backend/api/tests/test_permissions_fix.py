from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from api.models import Aircraft, Flight

User = get_user_model()

class PermissionFixTest(APITestCase):
    def setUp(self):
        # Create a regular user
        self.regular_user = User.objects.create_user(
            username='testuser', 
            password='testpassword'
        )
        self.client.force_authenticate(user=self.regular_user)

    def test_authenticated_user_can_create_aircraft(self):
        """
        Verify that a regular authenticated user can create an aircraft.
        """
        payload = {
            "tail_number": "N999TEST",
            "aircraft_type": "Test Jet",
            "airline_icao": "TST" # Adding this as it was in search fields, might be required or good to have
        }
        
        # We need the URL. Assuming 'aircraft-list' from router.
        # If this fails, I might need to look at urls.py
        # But commonly ModelViewSets registered with router use basename-list
        try:
            url = reverse('aircraft-list')
        except:
            # Fallback if I can't guess the reverse name, though 'aircraft-list' is standard for router.register('aircraft', ...)
            url = '/api/aircraft/'

        response = self.client.post(url, payload)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Failed to create aircraft: {response.data}")
        self.assertTrue(Aircraft.objects.filter(tail_number="N999TEST").exists())

    def test_authenticated_user_can_create_flight(self):
        """
        Verify that a regular authenticated user can create a flight.
        """
        # Create dependencies
        aircraft = Aircraft.objects.create(tail_number="N888TEST", aircraft_type="Test Prop")
        
        payload = {
            "aircraft": aircraft.pk,
            "flight_number": "FLT123",
            "call_sign": "TEST1234",
            "departure_time": "2025-12-25T10:00:00Z",
            "arrival_time": "2025-12-25T14:00:00Z",
            "origin": "KXYZ",
            "destination": "KABC",
            "flight_status": "scheduled",
            "flight_type": "GA",
        }
        
        try:
            url = reverse('flight-list')
        except:
            url = '/api/flights/' # Guessing based on common patterns if reverse fails

        response = self.client.post(url, payload)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Failed to create flight: {response.data}")
        self.assertTrue(Flight.objects.filter(call_sign="TEST1234").exists())
