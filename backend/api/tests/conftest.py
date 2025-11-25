from pytest_factoryboy import register

from api.tests.factories import (
	UserFactory,
	AdminUserFactory,
	ParkingLocationFactory,
	TrainingFactory,
	FuelerFactory,
	FuelerTrainingFactory,
	FuelerTrainingHistoryFactory,
)
from api.tests.fixtures import *  # noqa: F403

register(UserFactory)
register(AdminUserFactory)
register(ParkingLocationFactory)
register(TrainingFactory)
register(FuelerFactory)
register(FuelerTrainingFactory)
register(FuelerTrainingHistoryFactory)
