from django.contrib import admin

from .models import ModelAsset, ModelCategory


@admin.register(ModelCategory)
class ModelCategoryAdmin(admin.ModelAdmin):
    list_display = ("public_id", "name", "is_default", "customer", "created_at")
    list_filter = ("is_default",)
    search_fields = ("name",)
    readonly_fields = ("public_id",)


@admin.register(ModelAsset)
class ModelAssetAdmin(admin.ModelAdmin):
    list_display = ("public_id", "name", "category", "customer", "created_at")
    list_filter = ("category",)
    search_fields = ("name",)
    readonly_fields = ("public_id",)
