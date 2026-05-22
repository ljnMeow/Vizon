"""Data migration: create default category per customer and assign existing models."""

from django.db import migrations


def forwards(apps, schema_editor):
    ModelCategory = apps.get_model("models3d", "ModelCategory")
    ModelAsset = apps.get_model("models3d", "ModelAsset")
    Customer = apps.get_model("customers", "Customer")

    for customer in Customer.objects.all():
        cat, _ = ModelCategory.objects.get_or_create(
            customer=customer,
            is_default=True,
            defaults={"name": "默认模型"},
        )
        ModelAsset.objects.filter(customer=customer, category_new__isnull=True).update(
            category_new=cat
        )


def reverse(apps, schema_editor):
    ModelCategory = apps.get_model("models3d", "ModelCategory")
    ModelCategory.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("models3d", "0002_modelcategory_and_category_fk"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
