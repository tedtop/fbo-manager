from django.contrib.auth import get_user_model
from factory import Faker, Sequence, SubFactory, LazyAttribute
from factory.django import DjangoModelFactory
from api import models


class UserFactory(DjangoModelFactory):
    username = Sequence(lambda n: f"user{n}@example.com")
    email = LazyAttribute(lambda o: o.username)
    role = "line"
    is_staff = False

    class Meta:
        model = get_user_model()


class AdminUserFactory(UserFactory):
    role = "admin"
    is_staff = True


class ParkingLocationFactory(DjangoModelFactory):
    location_code = Sequence(lambda n: f"T-{n}")
    description = Faker("sentence", nb_words=3)
    airport = "MSO"
    display_order = 10

    class Meta:
        model = models.ParkingLocation


class TrainingFactory(DjangoModelFactory):
    training_name = Sequence(lambda n: f"Training {n}")
    validity_period_days = 30

    class Meta:
        model = models.Training


class FuelerFactory(DjangoModelFactory):
    user = SubFactory(UserFactory)
    fueler_name = LazyAttribute(lambda o: f"Fueler {o.user.username.split('@')[0]}")

    class Meta:
        model = models.Fueler


class FuelerTrainingFactory(DjangoModelFactory):
    fueler = SubFactory(FuelerFactory)
    training = SubFactory(TrainingFactory)
    completed_date = Faker("date_this_year")
    expiry_date = Faker("date_this_year")

    class Meta:
        model = models.FuelerTraining


class FuelerTrainingHistoryFactory(DjangoModelFactory):
    fueler = SubFactory(FuelerFactory)
    training = SubFactory(TrainingFactory)
    completed_date = Faker("date_this_year")
    expiry_date = Faker("date_this_year")

    class Meta:
        model = models.FuelerTrainingHistory
