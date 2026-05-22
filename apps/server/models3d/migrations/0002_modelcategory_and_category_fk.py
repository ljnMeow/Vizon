"""Create ModelCategory table and add nullable category_new FK to ModelAsset."""

import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0004_alter_customer_nickname"),
        ("models3d", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ModelCategory",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("public_id", models.UUIDField(db_index=True, default=uuid.uuid4, unique=True)),
                ("name", models.CharField(max_length=100)),
                ("is_default", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="model3d_categories",
                        to="customers.customer",
                    ),
                ),
            ],
            options={
                "db_table": "models3d_categories",
                "ordering": ["-is_default", "created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="modelcategory",
            index=models.Index(fields=["customer", "name"], name="uq_model3d_cat_cust_name"),
        ),
        migrations.AddField(
            model_name="modelasset",
            name="category_new",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="models",
                to="models3d.modelcategory",
            ),
        ),
    ]
