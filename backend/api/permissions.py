from rest_framework import permissions
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaffOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return super().has_permission(request, view)
        return super().has_permission(request, view) and request.user.is_staff


class IsAuthenticatedOrReadOnly(BasePermission):
    """
    Allow read-only access for anyone.
    Allow write access (POST/PUT/PATCH/DELETE) for any authenticated user.
    """

    def has_permission(self, request, view):
        # Allow anyone to read
        if request.method in SAFE_METHODS:
            return True

        # Write requires authentication
        return request.user and request.user.is_authenticated


class IsAdminUser(permissions.BasePermission):
    """
    Permission class that only allows admin users to access.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.role == "admin" or request.user.is_staff)
        )


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Permission class that allows read-only access to all authenticated users,
    but only allows write access to admin users.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return request.user.role == "admin" or request.user.is_staff


class AllowAnyReadOnly(permissions.BasePermission):
    """
    Permission class that allows unauthenticated read-only access,
    but requires admin authentication for write operations.

    FOR DEVELOPMENT USE ONLY - should be replaced with proper authentication
    in production.
    """

    def has_permission(self, request, view):
        # Allow all GET, HEAD, OPTIONS requests (read-only)
        if request.method in permissions.SAFE_METHODS:
            return True

        # For write operations, require admin user
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.role == "admin" or request.user.is_staff)
        )
