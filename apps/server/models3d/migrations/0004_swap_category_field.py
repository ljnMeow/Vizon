"""Make category_new non-null, remove old category CharField, rename field."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("models3d", "0003_migrate_categories"),
    ]

    operations = [
        migrations.AlterField(
            model_name="modelasset",
            name="category_new",
            field=models.ForeignKey(
                db_index=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="models",
                to="models3d.modelcategory",
            ),
        ),
        migrations.RemoveField(
            model_name="modelasset",
            name="category",
        ),
        migrations.RenameField(
            model_name="modelasset",
            old_name="category_new",
            new_name="category",
        ),
    ]
